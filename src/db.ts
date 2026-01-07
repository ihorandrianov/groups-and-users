import knex from "knex";

export const db = knex({
  client: "pg",
  connection: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/app",
  pool: {
    min: 2,
    max: 10,
  },
});
