-- MARKETING OPS · saca los datos demo que cargó datos-demo.sql. No toca nada tuyo: borra solo las dos marcas demo,
-- y con ellas sus piezas, historial, campañas, resultados e investigaciones.
delete from brands where id in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');
