package com.giftgenius.auth;

import java.time.Duration;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.giftgenius.auth.AuthDtos.AuthResponse;
import com.giftgenius.auth.AuthDtos.ChangePasswordRequest;
import com.giftgenius.auth.AuthDtos.ForgotPasswordRequest;
import com.giftgenius.auth.AuthDtos.IssuedTokens;
import com.giftgenius.auth.AuthDtos.LoginRequest;
import com.giftgenius.auth.AuthDtos.RegisterRequest;
import com.giftgenius.auth.AuthDtos.ResetPasswordRequest;
import com.giftgenius.auth.AuthDtos.UpdateProfileRequest;
import com.giftgenius.auth.AuthDtos.UserDto;
import com.giftgenius.common.ApiException;
import com.giftgenius.config.AppProperties;
import com.giftgenius.security.AuthUser;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    static final String REFRESH_COOKIE = "gg_refresh";
    static final String CSRF_HEADER = "X-Requested-With";
    static final String CSRF_VALUE = "GiftGenius";

    private final AuthService auth;
    private final AppProperties.Security props;

    public AuthController(AuthService auth, AppProperties properties) {
        this.auth = auth;
        this.props = properties.security();
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest req) {
        return withCookie(auth.register(req));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest req) {
        return withCookie(auth.login(req));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @CookieValue(name = REFRESH_COOKIE, required = false) String token,
            @RequestHeader(name = CSRF_HEADER, required = false) String csrf) {
        requireCsrfHeader(csrf);
        return withCookie(auth.refresh(token));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = REFRESH_COOKIE, required = false) String token,
            @RequestHeader(name = CSRF_HEADER, required = false) String csrf) {
        requireCsrfHeader(csrf);
        auth.logout(token);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString())
                .build();
    }

    @GetMapping("/me")
    public UserDto me(@AuthenticationPrincipal AuthUser user) {
        return auth.me(user.id());
    }

    @PatchMapping("/me")
    public UserDto updateProfile(@AuthenticationPrincipal AuthUser user, @Valid @RequestBody UpdateProfileRequest req) {
        return auth.updateProfile(user.id(), req);
    }

    /** Signs out every other session; this browser gets a fresh session. */
    @PostMapping("/password/change")
    public ResponseEntity<AuthResponse> changePassword(@AuthenticationPrincipal AuthUser user,
            @Valid @RequestBody ChangePasswordRequest req) {
        return withCookie(auth.changePassword(user.id(), req));
    }

    @PostMapping("/password/forgot")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
        auth.requestPasswordReset(req.email());
    }

    @PostMapping("/password/reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        auth.resetPassword(req);
    }

    private ResponseEntity<AuthResponse> withCookie(IssuedTokens tokens) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE,
                        cookie(tokens.refreshToken(), Duration.ofSeconds(auth.refreshTtlSeconds())).toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(tokens.body());
    }

    private ResponseCookie cookie(String value, Duration maxAge) {
        return ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(props.cookieSecure())
                .sameSite(props.cookieSameSite())
                .path("/api/auth")
                .maxAge(maxAge)
                .build();
    }

    private static void requireCsrfHeader(String value) {
        if (!CSRF_VALUE.equals(value)) {
            throw ApiException.forbidden("Missing request header.");
        }
    }
}
