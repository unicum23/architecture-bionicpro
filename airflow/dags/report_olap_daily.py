from __future__ import annotations

import os
import psycopg2
import requests
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta, date

from airflow import DAG

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "crm-postgres")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "crm")
POSTGRES_USER = os.getenv("POSTGRES_USER", "crm_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "crm_password")

CH_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
CH_HTTP_PORT = int(os.getenv("CLICKHOUSE_HTTP_PORT", "8123"))
CH_USER = os.getenv("CLICKHOUSE_USER", "default")
CH_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")
CH_DB = os.getenv("CLICKHOUSE_DB", "reports")


def _period() -> tuple[date, date]:
    to_d = datetime.utcnow().date() + timedelta(days=1)
    from_d = to_d - timedelta(days=1)
    return from_d, to_d


def _ch_request(url: str, query: str, body: bytes | None = None, auth=None) -> requests.Response:
    params = {"database": CH_DB, "query": query}
    resp = requests.post(
        url,
        params=params,
        data=body,
        auth=auth,
        timeout=30,
    )
    return resp


def load_to_clickhouse():
    period_from, period_to = _period()

    pg = psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
    )

    sql = """
          select u.user_id,
                 %s::date                                                         as period_from,
                 %s::date                                                         as period_to,
                 now()                                                            as generated_at,
                 count(e.id)::bigint                                              as telemetry_events,
                 sum(case when e.event_type = 'ERROR' then 1 else 0 end)::bigint  as errors_count,
                 u.full_name,
                 u.email,
                 coalesce(max(p.model), '')                                       as prosthesis_model
          from crm_user u
                   left join telemetry_event e
                             on e.user_id = u.user_id
                                 and e.created_at >= %s
                                 and e.created_at < %s
                   left join crm_prosthesis p
                             on p.user_id = u.user_id
          group by u.user_id, u.full_name, u.email \
          """

    with pg.cursor() as cur:
        cur.execute(sql, (period_from, period_to, period_from, period_to))
        rows = cur.fetchall()

    pg.close()

    if not rows:
        print("No rows to insert into ClickHouse for period:", period_from, period_to)
        return

    lines: list[str] = []
    for r in rows:
        user_id = r[0]
        pf = r[1]
        pt = r[2]
        generated_at = r[3]
        telemetry_events = int(r[4] or 0)
        errors_count = int(r[5] or 0)
        full_name = (r[6] or "").replace("\t", " ").replace("\n", " ")
        email = (r[7] or "").replace("\t", " ").replace("\n", " ")
        model = (r[8] or "").replace("\t", " ").replace("\n", " ")

        gen_ts = int(generated_at.timestamp())

        lines.append(
            f"{user_id}\t{pf}\t{pt}\t{gen_ts}\t"
            f"{telemetry_events}\t{errors_count}\t{full_name}\t{email}\t{model}"
        )

    data = "\n".join(lines) + "\n"
    url = f"http://{CH_HOST}:{CH_HTTP_PORT}/"
    auth = (CH_USER, CH_PASSWORD) if CH_PASSWORD else None

    del_query = (
        f"ALTER TABLE report_olap DELETE "
        f"WHERE period_from = '{period_from}' AND period_to = '{period_to}'"
        f" SETTINGS mutations_sync = 1"
    )
    del_resp = _ch_request(url, del_query, auth=auth)
    if del_resp.status_code >= 400:
        raise RuntimeError(f"ClickHouse DELETE failed: {del_resp.status_code} {del_resp.text[:500]}")

    print(f"Deleted period {period_from}..{period_to} from ClickHouse {CH_DB}.report_olap")

    ins_query = (
        "INSERT INTO report_olap "
        "(user_id, period_from, period_to, generated_at, telemetry_events, errors_count, crm_full_name, crm_email, prosthesis_model) "
        "FORMAT TabSeparated"
    )
    ins_resp = _ch_request(url, ins_query, body=data.encode("utf-8"), auth=auth)
    if ins_resp.status_code >= 400:
        raise RuntimeError(f"ClickHouse INSERT failed: {ins_resp.status_code} {ins_resp.text[:500]}")

    print(f"Inserted {len(rows)} rows into ClickHouse {CH_DB}.report_olap for period {period_from}..{period_to}")


with DAG(
        dag_id="report_olap_daily",
        start_date=datetime(2025, 1, 1),
        schedule="*/5 * * * *",
        catchup=False,
        default_args={"retries": 2, "retry_delay": timedelta(seconds=20)},
        tags=["reports"],
) as dag:
    PythonOperator(
        task_id="load_postgres_to_clickhouse",
        python_callable=load_to_clickhouse,
    )