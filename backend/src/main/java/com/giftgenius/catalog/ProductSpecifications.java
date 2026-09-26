package com.giftgenius.catalog;

import java.math.BigDecimal;

import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

import jakarta.persistence.criteria.Join;

final class ProductSpecifications {

    private ProductSpecifications() {
    }

    static Specification<Product> activeOnly() {
        return (root, q, cb) -> cb.isTrue(root.get("active"));
    }

    static Specification<Product> matchesText(String text) {
        if (!StringUtils.hasText(text)) {
            return Specification.unrestricted();
        }
        String like = "%" + text.trim().toLowerCase().replace("%", "\\%").replace("_", "\\_") + "%";
        return (root, q, cb) -> cb.or(
                cb.like(cb.lower(root.get("name")), like),
                cb.like(cb.lower(root.get("category")), like),
                cb.like(cb.lower(root.get("description")), like));
    }

    static Specification<Product> inCategory(String category) {
        if (!StringUtils.hasText(category)) {
            return Specification.unrestricted();
        }
        return (root, q, cb) -> cb.equal(root.get("category"), category.trim().toLowerCase());
    }

    static Specification<Product> hasTag(String tag) {
        return memberOf("tags", tag);
    }

    static Specification<Product> forOccasion(String occasion) {
        return memberOf("occasions", occasion);
    }

    static Specification<Product> priceBetween(BigDecimal min, BigDecimal max) {
        if (min == null && max == null) {
            return Specification.unrestricted();
        }
        return (root, q, cb) -> {
            if (min == null) {
                return cb.lessThanOrEqualTo(root.get("price"), max);
            }
            if (max == null) {
                return cb.greaterThanOrEqualTo(root.get("price"), min);
            }
            return cb.between(root.get("price"), min, max);
        };
    }

    private static Specification<Product> memberOf(String collection, String value) {
        if (!StringUtils.hasText(value)) {
            return Specification.unrestricted();
        }
        return (root, q, cb) -> {
            q.distinct(true);
            Join<Product, String> join = root.join(collection);
            return cb.equal(join, value.trim().toLowerCase());
        };
    }
}
