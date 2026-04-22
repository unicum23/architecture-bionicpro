package ru.shuvalovdn.reports.controller;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.shuvalovdn.reports.client.AuthSessionClient;
import ru.shuvalovdn.reports.dto.ReportModelDto;
import ru.shuvalovdn.reports.service.ReportService;


@RestController
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;
    private final AuthSessionClient authSessionClient;


    @GetMapping("/reports")
    public ReportModelDto report(HttpServletRequest request) {
        var session = authSessionClient.validateOrThrow(request);
        return reportService.findReportForUser(session.userId());
    }

}