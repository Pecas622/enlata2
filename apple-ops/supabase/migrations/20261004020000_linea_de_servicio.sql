-- APPLE OPS · etapa 3: las ventas también llevan conceptos libres (servicios sin stock).
-- Va en su propia migración porque un valor nuevo de enum no se puede usar en la misma transacción.
alter type line_kind add value if not exists 'service';
