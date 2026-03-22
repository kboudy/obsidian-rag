import { SQL } from "bun";
import { config } from "../config.ts";

export const sql = new SQL(config.postgresUrl);
