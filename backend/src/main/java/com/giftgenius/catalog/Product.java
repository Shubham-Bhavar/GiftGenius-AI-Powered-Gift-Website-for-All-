package com.giftgenius.catalog;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "products")
@Getter
@Setter
@NoArgsConstructor
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(nullable = false)
    private String name;

    /** Lower-case category key, e.g. "gift sets", "food & sweets". */
    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String description;

    @Column(name = "long_description", columnDefinition = "TEXT")
    private String longDescription;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    @Column(name = "original_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal originalPrice;

    @Column(nullable = false, precision = 2, scale = 1)
    private BigDecimal rating = BigDecimal.ZERO;

    @Column(name = "review_count", nullable = false)
    private int reviewCount;

    @Column(name = "image_url", nullable = false)
    private String imageUrl;

    @Column(name = "alt_text")
    private String altText;

    @Column(name = "badge_text")
    private String badgeText;

    @Column(name = "badge_class")
    private String badgeClass;

    @Column(nullable = false)
    private int stock;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean cultural;

    @Column(nullable = false)
    private boolean festival;

    @Version
    private long version;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @ElementCollection
    @BatchSize(size = 50)
    @CollectionTable(name = "product_tags", joinColumns = @JoinColumn(name = "product_id"))
    @Column(name = "tag")
    private Set<String> tags = new LinkedHashSet<>();

    @ElementCollection
    @BatchSize(size = 50)
    @CollectionTable(name = "product_occasions", joinColumns = @JoinColumn(name = "product_id"))
    @Column(name = "occasion")
    private Set<String> occasions = new LinkedHashSet<>();

    @ElementCollection
    @BatchSize(size = 50)
    @CollectionTable(name = "product_for_whom", joinColumns = @JoinColumn(name = "product_id"))
    @Column(name = "for_whom")
    private Set<String> forWhom = new LinkedHashSet<>();

    @ElementCollection
    @BatchSize(size = 50)
    @CollectionTable(name = "product_personalities", joinColumns = @JoinColumn(name = "product_id"))
    @Column(name = "personality")
    private Set<String> personalities = new LinkedHashSet<>();

    @ElementCollection
    @BatchSize(size = 50)
    @CollectionTable(name = "product_relationships", joinColumns = @JoinColumn(name = "product_id"))
    @Column(name = "relationship")
    private Set<String> relationships = new LinkedHashSet<>();

    public boolean isPurchasable() {
        return active && stock > 0;
    }
}
