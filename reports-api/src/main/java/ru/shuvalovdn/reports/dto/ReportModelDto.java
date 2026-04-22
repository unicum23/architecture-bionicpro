package ru.shuvalovdn.reports.dto;


import java.time.LocalDate;
import java.time.LocalDateTime;


public record ReportModelDto(
        String userId,
        LocalDate periodFrom,
        LocalDate periodTo,
        LocalDateTime generatedAt,
        long telemetryEvents,
        long errorsCount,
        String crmFullName,
        String crmEmail,
        String prosthesisModel
) {

}
