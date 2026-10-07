import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Tarjeta física de autorización de supervisor — alternativa al PIN/
 * contraseña del modal del POS, identificada al escanearla (Code128/QR).
 *
 * Una por usuario POR EMPRESA (no global): un usuario con cuenta en varias
 * empresas puede tener una tarjeta activa distinta en cada una — por eso
 * esto es una tabla propia y no una columna en `users` (a diferencia de
 * `pinSupervisor`, que sí es global por usuario).
 *
 * `codigoHash` es SHA-256 del código completo (con prefijo), NO bcrypt: el
 * código es un secreto aleatorio de ≥128 bits — a esa entropía, un hash
 * lento no aporta resistencia extra contra fuerza bruta (inviable de todos
 * modos frente a 2^128), y en cambio SHA-256 permite un `SELECT ... WHERE
 * "codigoHash" = $1` indexado y O(1): el escaneo identifica a la persona
 * SIN que el cajero la elija de una lista primero, así que no hay un
 * usuario conocido de antemano contra el cual comparar un hash lento uno
 * por uno. Mismo criterio que usan las API keys de alta entropía en la
 * industria (Stripe, GitHub, etc.) — ver tarjeta-codigo.util.ts.
 */
@Entity('tarjetas_supervisor')
@Index(['empresaId', 'userId', 'activa'])
export class TarjetaSupervisor {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: number;

  @Column()
  empresaId!: number;

  /** SHA-256 hex del código completo (prefijo + aleatorio) — único entre TODAS las empresas. */
  @Column({ type: 'varchar', length: 64, unique: true })
  codigoHash!: string;

  /** Para mostrar "Tarjeta ••••XXXX" sin volver a exponer el código completo. */
  @Column({ type: 'varchar', length: 4 })
  ultimosCuatro!: string;

  @Column({ default: true })
  activa!: boolean;

  @Column({ type: 'int', nullable: true })
  creadaPor?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  revocadaEn?: Date | null;

  @Column({ type: 'int', nullable: true })
  revocadaPor?: number | null;

  @Column({ type: 'text', nullable: true })
  motivoRevocacion?: string | null;

  @CreateDateColumn({ name: 'creadaEn' })
  creadaEn!: Date;
}
