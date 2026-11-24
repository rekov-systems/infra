# Facturación electrónica JCFlow (opcional)

JCFlow es opt-in por empresa. El negocio activa el módulo, registra su NIT y
guarda su propia API key cifrada en Postgres; ningún secreto se expone al
frontend ni se comparte entre tenants.

La emisión debe ejecutarse en una función server-side que valide JWT y
pertenencia al tenant, confirme que la empresa activó JCFlow y use una clave de
idempotencia derivada de la venta. Guarda petición/respuesta, CUFE, estado DIAN
y enlaces en un registro de transmisión tenant-scoped. Las notas requieren
referencia al documento aceptado original.

El POS upstream no incluye JCFlow ni un modelo fiscal colombiano. La UI/flujo de
activación y las tablas/función de transmisión son una extensión pendiente;
JCFlow no es requisito para usar caja, inventario o ventas.
