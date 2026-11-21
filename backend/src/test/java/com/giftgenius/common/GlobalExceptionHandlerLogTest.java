package com.giftgenius.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLIntegrityConstraintViolationException;

import org.junit.jupiter.api.Test;

/** A broken database rule is logged by its name, never with the value that broke it (an email, a name). */
class GlobalExceptionHandlerLogTest {

    @Test
    void aDuplicateIsLoggedByItsKeyWithoutTheValue() {
        String rule = GlobalExceptionHandler.integrityRule(new SQLIntegrityConstraintViolationException(
                "Duplicate entry 'asha.rao@example.com' for key 'users.uk_users_email'", "23000", 1062));
        assertThat(rule).isEqualTo("rule users.uk_users_email").doesNotContain("asha");
    }

    @Test
    void aForeignKeyOrCheckFailureIsLoggedByTheConstraintsName() {
        assertThat(GlobalExceptionHandler.integrityRule(new SQLIntegrityConstraintViolationException(
                "Cannot add or update a child row: a foreign key constraint fails (`giftgenius`.`order_items`, "
                        + "CONSTRAINT `fk_oi_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`))", "23000", 1452)))
                .isEqualTo("rule fk_oi_order");
        assertThat(GlobalExceptionHandler.integrityRule(new java.sql.SQLException(
                "Check constraint 'ck_products_stock' is violated.", "HY000", 3819))).isEqualTo("rule ck_products_stock");
        assertThat(GlobalExceptionHandler.integrityRule(new java.sql.SQLException(
                "Data too long for column 'full_name' at row 1: Asha", "22001", 1406)))
                .as("not a recognised wording: the type and SQL state only").isEqualTo("SQLException (SQL state 22001)");
    }

    @Test
    void anUnrecognisedMessageIsNeverLogged() {
        String rule = GlobalExceptionHandler.integrityRule(new IllegalStateException("value asha@example.com rejected"));
        assertThat(rule).isEqualTo("IllegalStateException").doesNotContain("asha");
        assertThat(GlobalExceptionHandler.integrityRule(null)).isEqualTo("unknown");
    }
}
