package com.giftgenius.auth;

import com.giftgenius.user.User;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank(message = "Enter your name") @Size(max = 120) String fullName,
            @NotBlank(message = "Enter your email") @Email(message = "Enter a valid email") @Size(max = 255) String email,
            @NotBlank(message = "Choose a password")
            @Size(min = 8, max = 72, message = "Use 8 to 72 characters") String password,
            @Pattern(regexp = "^$|^[+0-9 ()-]{7,20}$", message = "Enter a valid phone number") String phone) {
    }

    public record LoginRequest(
            @NotBlank(message = "Enter your email") @Email(message = "Enter a valid email") String email,
            @NotBlank(message = "Enter your password") @Size(max = 72) String password) {
    }

    public record ForgotPasswordRequest(
            @NotBlank(message = "Enter your email") @Email(message = "Enter a valid email") @Size(max = 255) String email) {
    }

    public record ResetPasswordRequest(
            @NotBlank @Size(max = 100) String token,
            @NotBlank(message = "Choose a password")
            @Size(min = 8, max = 72, message = "Use 8 to 72 characters") String password) {
    }

    public record ChangePasswordRequest(
            @NotBlank(message = "Enter your current password") String currentPassword,
            @NotBlank(message = "Choose a new password")
            @Size(min = 8, max = 72, message = "Use 8 to 72 characters") String newPassword) {
    }

    public record UpdateProfileRequest(
            @NotBlank(message = "Enter your name") @Size(max = 120) String fullName,
            @Pattern(regexp = "^$|^[+0-9 ()-]{7,20}$", message = "Enter a valid phone number") String phone) {
    }

    public record UserDto(Long id, String email, String fullName, String phone, String role) {
        public static UserDto from(User u) {
            return new UserDto(u.getId(), u.getEmail(), u.getFullName(), u.getPhone(), u.getRole().name());
        }
    }

    public record AuthResponse(String accessToken, long expiresIn, UserDto user) {
    }

    /** Internal result carrying the raw refresh token for the controller to put in a cookie. */
    public record IssuedTokens(AuthResponse body, String refreshToken) {
    }
}
