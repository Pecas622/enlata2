// Catálogo de las 8 "latas" de Enlata2. INMO OPS, DISTRIBUIDORA OPS, AUTO OPS,
// CLUB OPS y RESTAURANT OPS tienen dashboard a medida (src/pages/InmoOps.jsx,
// DistribuidoraOps.jsx, AutoOps.jsx, ClubOps.jsx, RestaurantOps.jsx); las
// otras 3 corren sobre el motor genérico (src/lib/GenericOps.jsx) a partir de
// su lista de `modules`.

export const PRODUCTS = [
  {
    id: "apple", name: "APPLE OPS", num: "01", rubro: "Locales de celulares", currency: "usd",
    modules: [
      {
        id: "stock", label: "Stock", icon: "▦", countLabel: "equipos publicados", addLabel: "Nuevo equipo",
        emptyText: "Todavía no cargaste equipos.", addedMsg: "Equipo agregado",
        titleField: "model", amountField: "price", tagFields: ["condition"],
        statusField: "status", statusOptions: ["Disponible", "Reservado", "Vendido"],
        statusTone: (s) => (s === "Disponible" ? "green" : s === "Reservado" ? "amber" : "gray"),
        fields: [
          { key: "model", label: "Modelo", type: "text", required: true, placeholder: "iPhone 13 128GB" },
          { key: "condition", label: "Estado del equipo", type: "select", options: ["Nuevo", "Usado - Excelente", "Usado - Bueno"] },
          { key: "price", label: "Precio (USD)", type: "number", required: true, placeholder: "650" },
          { key: "status", label: "Estado", type: "select", options: ["Disponible", "Reservado", "Vendido"] },
        ],
      },
      {
        id: "ventas", label: "Ventas", icon: "✓", countLabel: "cerradas", addLabel: "Nueva venta",
        emptyText: "Todavía no hay ventas cargadas.", addedMsg: "Venta registrada",
        titleField: "client", amountField: "amount", tagFields: ["method"], subtitleFields: ["equipment", "date"],
        fields: [
          { key: "client", label: "Cliente", type: "text", required: true, placeholder: "Juan Pérez" },
          { key: "equipment", label: "Equipo", type: "text", required: true, placeholder: "iPhone 13 128GB" },
          { key: "amount", label: "Monto (USD)", type: "number", required: true, placeholder: "650" },
          { key: "method", label: "Método de pago", type: "select", options: ["Efectivo", "Transferencia", "Tarjeta", "Plan Canje"] },
          { key: "date", label: "Fecha", type: "date" },
        ],
      },
      { id: "cash", label: "Caja", icon: "$", type: "cash" },
      {
        id: "canje", label: "Plan Canje", icon: "⇄", countLabel: "canjes", addLabel: "Nuevo canje",
        emptyText: "Todavía no hay canjes registrados.", addedMsg: "Canje registrado",
        titleField: "client", amountField: "recognizedValue", tagFields: ["deviceCondition"], subtitleFields: ["deviceIn", "date"],
        fields: [
          { key: "client", label: "Cliente", type: "text", required: true, placeholder: "Juan Pérez" },
          { key: "deviceIn", label: "Equipo entregado", type: "text", required: true, placeholder: "iPhone 8 64GB" },
          { key: "deviceCondition", label: "Estado", type: "select", options: ["Excelente", "Bueno", "Regular"] },
          { key: "recognizedValue", label: "Valor reconocido (USD)", type: "number", required: true, placeholder: "150" },
          { key: "date", label: "Fecha", type: "date" },
        ],
      },
    ],
  },
  { id: "inmo", name: "INMO OPS", num: "02", rubro: "Inmobiliarias", builtin: true },
  { id: "club", name: "CLUB OPS", num: "03", rubro: "Clubes y asociaciones", builtin: true },
  { id: "auto", name: "AUTO OPS", num: "04", rubro: "Concesionarias", builtin: true },
  { id: "restaurant", name: "RESTAURANT OPS", num: "05", rubro: "Gastronomía", builtin: true },
  { id: "distribuidora", name: "DISTRIBUIDORA OPS", num: "06", rubro: "Distribuidoras y mayoristas", builtin: true },
  {
    id: "gym", name: "GYM OPS", num: "07", rubro: "Gimnasios", currency: "ars",
    modules: [
      {
        id: "socios", label: "Socios", icon: "●", countLabel: "socios", addLabel: "Nuevo socio",
        emptyText: "Todavía no cargaste socios.", addedMsg: "Socio agregado",
        titleField: "name", tagFields: ["plan"], subtitleFields: ["phone", "dueDate"],
        statusField: "status", statusOptions: ["Activo", "Vencido"],
        statusTone: (s) => (s === "Activo" ? "green" : "red"),
        fields: [
          { key: "name", label: "Nombre", type: "text", required: true, placeholder: "Juan Pérez" },
          { key: "phone", label: "Teléfono", type: "text", placeholder: "+54 9 261 555 0100" },
          { key: "plan", label: "Plan", type: "select", options: ["Mensual", "Trimestral", "Anual"] },
          { key: "dueDate", label: "Vencimiento", type: "date" },
          { key: "status", label: "Estado", type: "select", options: ["Activo", "Vencido"] },
        ],
      },
      {
        id: "clases", label: "Clases", icon: "▧", countLabel: "clases", addLabel: "Nueva clase",
        emptyText: "Todavía no cargaste clases.", addedMsg: "Clase agregada",
        titleField: "name", tagFields: ["instructor"], subtitleFields: ["schedule", "capacity"],
        fields: [
          { key: "name", label: "Nombre", type: "text", required: true, placeholder: "Funcional" },
          { key: "instructor", label: "Instructor", type: "text", placeholder: "Male" },
          { key: "schedule", label: "Horario", type: "text", placeholder: "Lun/Mié/Vie 18hs" },
          { key: "capacity", label: "Cupo", type: "number", placeholder: "20" },
        ],
      },
      {
        id: "accesos", label: "Accesos", icon: "→", countLabel: "registrados", addLabel: "Nuevo acceso",
        emptyText: "Todavía no hay accesos registrados.", addedMsg: "Acceso registrado",
        titleField: "member", tagFields: ["type"], subtitleFields: ["date", "time"],
        fields: [
          { key: "member", label: "Socio", type: "text", required: true, placeholder: "Juan Pérez" },
          { key: "type", label: "Tipo", type: "select", options: ["Ingreso", "Egreso"] },
          { key: "date", label: "Fecha", type: "date" },
          { key: "time", label: "Hora", type: "time" },
        ],
      },
      { id: "cash", label: "Caja", icon: "$", type: "cash" },
    ],
  },
  {
    id: "academy", name: "ACADEMY OPS", num: "08", rubro: "Cursos y academias", currency: "ars",
    businessName: "Go Travel Academy", businessUrl: "https://gotravelacademy.com",
    modules: [
      {
        id: "alumnos", label: "Alumnos", icon: "●", countLabel: "alumnos", addLabel: "Nuevo alumno",
        emptyText: "Todavía no cargaste alumnos.", addedMsg: "Alumno agregado",
        titleField: "name", tagFields: ["course"], subtitleFields: ["phone", "enrollDate"],
        fields: [
          { key: "name", label: "Nombre", type: "text", required: true, placeholder: "Juan Pérez" },
          { key: "phone", label: "Teléfono", type: "text", placeholder: "+54 9 261 555 0100" },
          { key: "course", label: "Curso", type: "text", placeholder: "Inglés B1" },
          { key: "enrollDate", label: "Fecha de inscripción", type: "date" },
        ],
      },
      {
        id: "cursos", label: "Cursos", icon: "▧", countLabel: "cursos", addLabel: "Nuevo curso",
        emptyText: "Todavía no cargaste cursos.", addedMsg: "Curso agregado",
        titleField: "name", tagFields: ["teacher"], subtitleFields: ["schedule", "capacity"],
        fields: [
          { key: "name", label: "Nombre", type: "text", required: true, placeholder: "Inglés B1" },
          { key: "teacher", label: "Docente", type: "text", placeholder: "Ana Gómez" },
          { key: "schedule", label: "Horario", type: "text", placeholder: "Mar/Jue 19hs" },
          { key: "capacity", label: "Cupo", type: "number", placeholder: "15" },
        ],
      },
      {
        id: "pagos", label: "Pagos", icon: "$", countLabel: "pagos", addLabel: "Nuevo pago",
        emptyText: "Todavía no hay pagos registrados.", addedMsg: "Pago registrado",
        titleField: "student", amountField: "amount", tagFields: ["course"], subtitleFields: ["date"],
        statusField: "status", statusOptions: ["Pendiente", "Pagado"],
        statusTone: (s) => (s === "Pagado" ? "green" : "amber"),
        fields: [
          { key: "student", label: "Alumno", type: "text", required: true, placeholder: "Juan Pérez" },
          { key: "course", label: "Curso", type: "text", placeholder: "Inglés B1" },
          { key: "amount", label: "Monto", type: "number", required: true, placeholder: "20000" },
          { key: "date", label: "Fecha", type: "date" },
          { key: "status", label: "Estado", type: "select", options: ["Pendiente", "Pagado"] },
        ],
      },
      {
        id: "asistencia", label: "Asistencia", icon: "✓", countLabel: "registros", addLabel: "Registrar asistencia",
        emptyText: "Todavía no hay asistencia registrada.", addedMsg: "Asistencia registrada",
        titleField: "student", tagFields: ["course"], subtitleFields: ["date"],
        statusField: "status", statusOptions: ["Presente", "Ausente"],
        statusTone: (s) => (s === "Presente" ? "green" : "red"),
        fields: [
          { key: "student", label: "Alumno", type: "text", required: true, placeholder: "Juan Pérez" },
          { key: "course", label: "Curso", type: "text", placeholder: "Inglés B1" },
          { key: "date", label: "Fecha", type: "date" },
          { key: "status", label: "Estado", type: "select", options: ["Presente", "Ausente"] },
        ],
      },
    ],
  },
];
