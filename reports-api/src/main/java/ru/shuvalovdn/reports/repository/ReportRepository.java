package ru.shuvalovdn.reports.repository;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import ru.shuvalovdn.reports.dto.ReportModelDto;

import java.util.List;


@Repository
public class ReportRepository {

    private final JdbcTemplate ch;


    public ReportRepository(@Qualifier("clickHouseJdbcTemplate") JdbcTemplate ch) {
        this.ch = ch;
    }

    private static final RowMapper<ReportModelDto> MAPPER = (rs, rowNum) ->
            new ReportModelDto(
                    rs.getString("user_id"),
                    rs.getDate("period_from").toLocalDate(),
                    rs.getDate("period_to").toLocalDate(),
                    rs.getTimestamp("generated_at").toLocalDateTime(),
                    rs.getLong("telemetry_events"),
                    rs.getLong("errors_count"),
                    rs.getString("crm_full_name"),
                    rs.getString("crm_email"),
                    rs.getString("prosthesis_model")
            );


    public ReportModelDto findReportForUser(String userId) {
        String sql = """
                    select
                      user_id, period_from, period_to, generated_at,
                      telemetry_events, errors_count,
                      crm_full_name, crm_email, prosthesis_model
                    from reports.report_olap
                    where user_id = ?
                    order by generated_at desc
                    limit 1
                """;

        List<ReportModelDto> rows = ch.query(sql, MAPPER, userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

}