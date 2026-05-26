export enum UserRole {
  SUPER_ADMIN = 'super_admin', // Administrador global de la plataforma HiCloud
  ADMIN       = 'admin',
  CONTADOR    = 'contador',
  VENDEDOR    = 'vendedor',
  VIEWER      = 'viewer',
  EMPLEADO    = 'empleado',   // Acceso exclusivo al Portal del Empleado (sus propios datos)
}
