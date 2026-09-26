package com.giftgenius.catalog;

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
}
