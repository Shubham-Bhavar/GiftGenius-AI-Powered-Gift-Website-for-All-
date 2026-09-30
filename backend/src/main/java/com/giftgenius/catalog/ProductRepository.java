package com.giftgenius.catalog;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long>, JpaSpecificationExecutor<Product> {

    Optional<Product> findByIdAndActiveTrue(Long id);

    boolean existsBySlug(String slug);

    List<Product> findByActiveTrueAndStockGreaterThan(int stock);

    List<Product> findTop8ByActiveTrueAndCategoryAndIdNotOrderByRatingDesc(String category, Long id);

    List<Product> findTop8ByActiveTrueAndIdNotOrderByRatingDesc(Long id);

    List<Product> findByActiveTrueAndStockLessThanOrderByStockAsc(int threshold);

    /** Race-safe stock reservation: succeeds only if enough stock remains. Returns rows updated (0 or 1). */
    @Modifying(flushAutomatically = true)
    @Query("update Product p set p.stock = p.stock - :qty, p.version = p.version + 1 "
            + "where p.id = :id and p.active = true and p.stock >= :qty")
    int reserveStock(@Param("id") Long id, @Param("qty") int qty);

    @Modifying(flushAutomatically = true)
    @Query("update Product p set p.stock = p.stock + :qty, p.version = p.version + 1 where p.id = :id")
    int releaseStock(@Param("id") Long id, @Param("qty") int qty);

    @Query("select p.category, count(p) from Product p where p.active = true group by p.category order by p.category")
    List<Object[]> countByCategory();

    // ── Marketplace: every seller query filters on the owner's id ──

    /** Rows of: status, count; for one seller. */
    @Query("select p.status, count(p) from Product p where p.seller.userId = :sellerId group by p.status")
    List<Object[]> countByStatusFor(@Param("sellerId") Long sellerId);

    long countBySellerUserIdAndActiveTrue(Long sellerId);

    long countByStatus(ProductStatus status);

    long countBySellerUserIdAndStatusAndStock(Long sellerId, ProductStatus status, int stock);

    /** Rows of: seller id, products, products awaiting approval; for a page of sellers at once. */
    @Query("select p.seller.userId, count(p), sum(case when p.status = com.giftgenius.catalog.ProductStatus.PENDING_APPROVAL "
            + "then 1 else 0 end) from Product p where p.seller.userId in :sellerIds group by p.seller.userId")
    List<Object[]> countsBySeller(@Param("sellerIds") Collection<Long> sellerIds);

    List<Product> findTop5BySellerUserIdOrderByUpdatedAtDesc(Long sellerId);

    List<Product> findTop50BySellerUserIdOrderByUpdatedAtDesc(Long sellerId);

    @Query("select distinct p.category from Product p where p.seller.userId = :sellerId and p.active = true "
            + "order by p.category")
    List<String> listedCategoriesOf(@Param("sellerId") Long sellerId);

    /** Takes a store's products off the shop (store suspended). Statuses are kept for when it is reactivated. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Product p set p.active = false where p.seller.userId = :sellerId")
    int unlistAllOf(@Param("sellerId") Long sellerId);

    /** Lists a store's approved products again (store approved or reactivated). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Product p set p.active = true where p.seller.userId = :sellerId "
            + "and p.status = com.giftgenius.catalog.ProductStatus.APPROVED")
    int relistApprovedOf(@Param("sellerId") Long sellerId);
}
