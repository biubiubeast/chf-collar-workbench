import {integer,sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const siteSessions=sqliteTable('site_sessions',{idHash:text('id_hash').primaryKey(),role:text('role').notNull(),expiresAt:integer('expires_at').notNull()});
export const loginAttempts=sqliteTable('login_attempts',{bucket:text('bucket').primaryKey(),windowStart:integer('window_start').notNull(),attempts:integer('attempts').notNull()});
export const clientDisplay=sqliteTable('client_display',{id:integer('id').primaryKey(),body:text('body').notNull(),updatedAt:text('updated_at').notNull()});
