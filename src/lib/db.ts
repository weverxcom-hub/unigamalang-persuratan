import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { DbShape, User, Unit, LetterType, NumberingSequence, Archive } from "./types";

const IS_WRITABLE = process.env.VERCEL !== "1" && process.env.NEXT_RUNTIME !== "edge";
const DB_PATH = path.join(process.cwd(), "data", "db.json");

function seed(): DbShape {
  const now = new Date().toISOString();
  const units: Unit[] = [
    { id: "u-rektorat", code: "UNIGA", name: "Rektorat Universitas Gajayana", createdAt: now },
    { id: "u-yayasan", code: "YAS", name: "Yayasan Gajayana", createdAt: now },
    { id: "u-fe", code: "FE", name: "Fakultas Ekonomi", createdAt: now },
    { id: "u-fh", code: "FH", name: "Fakultas Hukum", createdAt: now },
  ];
  const letterTypes: LetterType[] = [
    { id: "lt-sk", code: "SK", name: "Surat Keputusan", createdAt: now },
    { id: "lt-st", code: "ST", name: "Surat Tugas", createdAt: now },
    { id: "lt-sp", code: "SP", name: "Surat Pengantar", createdAt: now },
    { id: "lt-sund", code: "UND", name: "Surat Undangan", createdAt: now },
    { id: "lt-sedar", code: "EDAR", name: "Surat Edaran", createdAt: now },
  ];
  const passwordHash = bcrypt.hashSync("Password123!", 10);
  const users: User[] = [
    {
      id: "user-superadmin",
      email: "superadmin@unigamalang.ac.id",
      name: "Super Admin Pusat",
      passwordHash,
      role: "SUPER_ADMIN",
      unitId: null,
      createdAt: now,
    },
    {
      id: "user-admin-rektorat",
      email: "admin.rektorat@unigamalang.ac.id",
      name: "Admin Rektorat",
      passwordHash,
      role: "ADMIN_UNIT",
      unitId: "u-rektorat",
      createdAt: now,
    },
    {
      id: "user-admin-yayasan",
      email: "admin.yayasan@unigamalang.ac.id",
      name: "Admin Yayasan",
      passwordHash,
      role: "ADMIN_UNIT",
      unitId: "u-yayasan",
      createdAt: now,
    },
    {
      id: "user-staff",
      email: "staff@unigamalang.ac.id",
      name: "Staff Rektorat",
      passwordHash,
      role: "USER",
      unitId: "u-rektorat",
      createdAt: now,
    },
  ];
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const sequences: NumberingSequence[] = [
    { id: `u-rektorat:lt-sk:${year}`, unitId: "u-rektorat", letterTypeId: "lt-sk", year, lastNumber: 2 },
    { id: `u-yayasan:lt-st:${year}`, unitId: "u-yayasan", letterTypeId: "lt-st", year, lastNumber: 1 },
  ];
  const archives: Archive[] = [
    {
      id: "arc-1",
      number: `001/UNIGA/SK/${romans[month - 1]}/${year}`,
      date: now,
      subject: "Penetapan Panitia Wisuda Semester Genap",
      recipient: "Seluruh Civitas Akademika",
      unitId: "u-rektorat",
      unitCode: "UNIGA",
      letterTypeId: "lt-sk",
      letterTypeCode: "SK",
      sequenceNumber: 1,
      fileName: "sk-panitia-wisuda.pdf",
      direction: "OUTGOING",
      status: "ISSUED",
      createdById: "user-admin-rektorat",
      createdAt: now,
    },
    {
      id: "arc-2",
      number: `002/UNIGA/SK/${romans[month - 1]}/${year}`,
      date: now,
      subject: "Pembentukan Tim Akreditasi Program Studi",
      recipient: "Dekan Seluruh Fakultas",
      unitId: "u-rektorat",
      unitCode: "UNIGA",
      letterTypeId: "lt-sk",
      letterTypeCode: "SK",
      sequenceNumber: 2,
      fileName: null,
      direction: "OUTGOING",
      status: "ISSUED",
      createdById: "user-admin-rektorat",
      createdAt: now,
    },
    {
      id: "arc-3",
      number: `001/YAS/ST/${romans[month - 1]}/${year}`,
      date: now,
      subject: "Penugasan Kunjungan Kerja ke Kampus Cabang",
      recipient: "Kepala Biro Umum",
      unitId: "u-yayasan",
      unitCode: "YAS",
      letterTypeId: "lt-st",
      letterTypeCode: "ST",
      sequenceNumber: 1,
      fileName: "st-kunjungan-kerja.pdf",
      direction: "OUTGOING",
      status: "ISSUED",
      createdById: "user-admin-yayasan",
      createdAt: now,
    },
  ];
  return { users, units, letterTypes, sequences, archives };
}

let memory: DbShape | null = null;

function loadFromDisk(): DbShape | null {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      return JSON.parse(raw) as DbShape;
    }
  } catch {
    // ignore
  }
  return null;
}

function persist(data: DbShape) {
  if (!IS_WRITABLE) return;
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // ignore persistence failures on readonly hosts (e.g. Vercel)
  }
}

export function getDb(): DbShape {
  if (memory) return memory;
  const fromDisk = loadFromDisk();
  memory = fromDisk ?? seed();
  if (!fromDisk) persist(memory);
  return memory;
}

export function saveDb(data: DbShape) {
  memory = data;
  persist(data);
}

export function resetDb() {
  memory = seed();
  persist(memory);
}

export function uid(prefix = "id"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
