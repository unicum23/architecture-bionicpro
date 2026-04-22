create database if not exists reports;

create table if not exists reports.report_olap (
                                                   user_id String,
                                                   period_from Date,
                                                   period_to Date,
                                                   generated_at DateTime,

                                                   telemetry_events UInt64,
                                                   errors_count UInt64,

                                                   crm_full_name String,
                                                   crm_email String,
                                                   prosthesis_model String
)
    engine = MergeTree
    order by (user_id, period_to, generated_at);
