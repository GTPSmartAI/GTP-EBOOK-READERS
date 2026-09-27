-- ==========================================================
-- Aedolia - Schema do Banco de Dados MariaDB / MySQL
-- Execute este script no phpMyAdmin da VPS (2.25.124.5)
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `ebook_readers_gtp`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ebook_readers_gtp`;

-- 1. Tabela de Usuários / Perfis
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NULL,
  `full_name` VARCHAR(255) NULL,
  `avatar_url` TEXT NULL,
  `subscription_tier` VARCHAR(32) DEFAULT 'free', -- 'free', 'pro', 'unlimited'
  `subscription_status` VARCHAR(32) DEFAULT 'active', -- 'active', 'trialing', 'canceled'
  `words_read_total` BIGINT DEFAULT 0,
  `daily_words_read` INT DEFAULT 0,
  `last_active_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabela de Livros e Documentos Extraídos
CREATE TABLE IF NOT EXISTS `books` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NULL,
  `title` VARCHAR(255) NOT NULL,
  `author` VARCHAR(255) DEFAULT 'Autor Desconhecido',
  `cover_gradient` VARCHAR(255) DEFAULT 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  `cover_image_url` TEXT NULL,
  `type` VARCHAR(16) NOT NULL DEFAULT 'pdf', -- 'pdf', 'epub', 'docx', 'html', 'txt'
  `content` LONGTEXT NOT NULL,
  `sentences` LONGTEXT NULL, -- JSON array de unidades faladas (frases e trechos de fala/narração)
  `chapters` JSON NULL, -- JSON array de capítulos
  `structure` LONGTEXT NULL, -- JSON {version, paragraph_starts, kinds}: parágrafos e tipo de cada unidade (n/d/h)
  `total_words` INT DEFAULT 0,
  `duration_minutes` INT DEFAULT 0,
  `file_url` TEXT NULL,
  `is_public` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_books_user` (`user_id`),
  INDEX `idx_books_user_created` (`user_id`, `created_at` DESC),
  INDEX `idx_books_public_created` (`is_public`, `created_at` DESC),
  CONSTRAINT `fk_books_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabela de Progresso de Leitura por Usuário
CREATE TABLE IF NOT EXISTS `reading_progress` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `book_id` VARCHAR(64) NOT NULL,
  `last_sentence_index` INT DEFAULT 0,
  `progress_percentage` INT DEFAULT 0,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_user_book` (`user_id`, `book_id`),
  INDEX `idx_prog_user` (`user_id`),
  INDEX `idx_prog_book` (`book_id`),
  CONSTRAINT `fk_prog_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_prog_book` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabela de Vozes Customizadas / Clonadas
CREATE TABLE IF NOT EXISTS `cloned_voices` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `gender` VARCHAR(16) DEFAULT 'male',
  `style` VARCHAR(64) DEFAULT 'Dramático & Suspense',
  `pitch` VARCHAR(16) DEFAULT '-8Hz',
  `rate` VARCHAR(16) DEFAULT '-10%',
  `cadence` VARCHAR(32) DEFAULT 'espacosa',
  `base_voice` VARCHAR(64) DEFAULT 'pt-BR-AntonioNeural',
  `sample_audio_url` TEXT NULL,
  `metadata` JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_voices_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabela de Assinaturas e Webhooks de Pagamento (Kiwify, Stripe, Asaas, Hotmart)
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(64) NULL,
  `email` VARCHAR(255) NOT NULL,
  `plan` VARCHAR(64) NOT NULL DEFAULT 'pro_monthly',
  `amount` DECIMAL(10, 2) DEFAULT 0.00,
  `gateway` VARCHAR(32) DEFAULT 'kiwify',
  `transaction_id` VARCHAR(255) NULL,
  `status` VARCHAR(32) DEFAULT 'paid',
  `payload` JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sub_email` (`email`),
  INDEX `idx_sub_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
