package ru.shuvalovdn.reports.client;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import ru.shuvalovdn.reports.dto.ValidateResponseDto;


@Service
public class AuthSessionClient {

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.auth.validate-url}")
    private String validateUrl;


    public ValidateResponseDto validateOrThrow(HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();

        String cookieHeader = request.getHeader("Cookie");
        if (cookieHeader != null && !cookieHeader.isBlank()) {
            headers.add(HttpHeaders.COOKIE, cookieHeader);
        }

        HttpEntity<Void> entity = new HttpEntity<>(headers);

        ResponseEntity<ValidateResponseDto> resp = restTemplate.exchange(
                validateUrl,
                HttpMethod.POST,
                entity,
                ValidateResponseDto.class
        );

        ValidateResponseDto body = resp.getBody();
        if (body == null || !body.valid() || body.userId() == null || body.userId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid session");
        }
        return body;
    }

}