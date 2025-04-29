import { pgTable, text, uuid, timestamp, pgSchema, integer, boolean, numeric } from 'drizzle-orm/pg-core';

// Define the schema object
export const goodCupSchema = pgSchema('good_cup');

// --- Table Definitions ---

// Define Drizzle users table within the specified schema
export const usersTable = goodCupSchema.table('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Define Beans table
export const beansTable = goodCupSchema.table('beans', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),  
  origin: text('origin'),
  roastLevel: text('roast_level'),
  roastedDate: timestamp('roasted_date', { withTimezone: true }),
  flavorNotes: text('flavor_notes').array(), // Array of strings
  imageUrl: text('image_url'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Define Brew Devices table
export const brewDevicesTable = goodCupSchema.table('brew_devices', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Define Grinders table
export const grindersTable = goodCupSchema.table('grinders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Define Brews table
export const brewsTable = goodCupSchema.table('brews', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  beanId: uuid('bean_id').notNull().references(() => beansTable.id, { onDelete: 'cascade' }),
  brewDeviceId: uuid('brew_device_id').references(() => brewDevicesTable.id, { onDelete: 'set null' }),
  grinderId: uuid('grinder_id').references(() => grindersTable.id, { onDelete: 'set null' }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  steepTimeSeconds: integer('steep_time_seconds'),
  grindSize: text('grind_size'),
  waterTempCelsius: numeric('water_temp_celsius'), // Using numeric for potential decimals
  useBloom: boolean('use_bloom'),
  bloomTimeSeconds: integer('bloom_time_seconds'),
  notes: text('notes'),
  rating: integer('rating'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Define User Settings table
export const userSettingsTable = goodCupSchema.table('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => usersTable.id, { onDelete: 'cascade' }),
  defaultBrewDeviceId: uuid('default_brew_device_id').references(() => brewDevicesTable.id, { onDelete: 'set null' }),
  defaultGrinderId: uuid('default_grinder_id').references(() => grindersTable.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}); 