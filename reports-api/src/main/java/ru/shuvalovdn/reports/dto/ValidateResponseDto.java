package ru.shuvalovdn.reports.dto;

public record ValidateResponseDto(
        boolean valid,
        String userId,
        java.util.List<String> roles,
        String newSid
) {

}
