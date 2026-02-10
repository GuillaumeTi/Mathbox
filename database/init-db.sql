-- MathCam Database Schema
-- Create database and tables for the tutoring platform

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('PROF', 'STUDENT')),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create courses table
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    prof_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    join_code VARCHAR(50) UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    level VARCHAR(100),
    schedule_day INTEGER CHECK (schedule_day BETWEEN 0 AND 6),
    schedule_time TIME,
    livekit_room_name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create summaries table
CREATE TABLE IF NOT EXISTS summaries (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_path VARCHAR(500) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_courses_prof_id ON courses(prof_id);
CREATE INDEX IF NOT EXISTS idx_courses_student_id ON courses(student_id);
CREATE INDEX IF NOT EXISTS idx_courses_join_code ON courses(join_code);
CREATE INDEX IF NOT EXISTS idx_summaries_course_id ON summaries(course_id);
