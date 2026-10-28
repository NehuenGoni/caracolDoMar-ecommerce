import mongoose, { type ClientSession } from "mongoose";

let supportsTransactions: boolean | undefined;

/**
 * Las transacciones multi-documento necesitan un replica set (Atlas lo es). Un Mongo local suelto
 * no las soporta: en ese caso las operaciones corren igual, una por una y sin sesión.
 */
async function transactionsSupported(): Promise<boolean> {
  if (supportsTransactions === undefined) {
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    supportsTransactions = Boolean(hello.setName) || hello.msg === "isdbgrid";
  }
  return supportsTransactions;
}

/**
 * Corre `fn` dentro de una transacción: o se aplican todas sus escrituras o ninguna. `fn` recibe la
 * sesión (o `undefined` si el Mongo no soporta transacciones) y tiene que pasarla a cada consulta,
 * y no puede tener efectos fuera de la base (emails, llamadas a APIs): se puede reintentar entero.
 */
export async function withTransaction<T>(
  fn: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  if (!(await transactionsSupported())) return fn(undefined);

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
