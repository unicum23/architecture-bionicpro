package ru.shuvalovdn.reports.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import ru.shuvalovdn.reports.dto.ReportModelDto;
import ru.shuvalovdn.reports.repository.ReportRepository;


@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepository;


    public ReportModelDto findReportForUser(String userId) {
        return reportRepository.findReportForUser(userId);
    }

}