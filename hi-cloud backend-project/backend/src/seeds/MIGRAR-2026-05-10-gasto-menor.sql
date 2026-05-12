-- ─────────────────────────────────────────────────────────────────────────────
-- Migración: Agregar categoría 'gasto_menor' al enum de gastos
-- Fecha: 2026-05-10
-- ─────────────────────────────────────────────────────────────────────────────

-- PostgreSQL no permite eliminar valores de un enum, pero SÍ permite agregar.
-- ADD VALUE es idempotente en PG 14+ si se usa IF NOT EXISTS.
ALTER TYPE gastos_categoria_enum ADD VALUE IF NOT EXISTS 'gasto_menor' BEFORE 'otros';
