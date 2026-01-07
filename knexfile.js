/** @type {import('knex').Knex.Config} */
export default {
  client: "pg",
  connection: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/app",
  migrations: {
    directory: "./migrations",
  },
};
