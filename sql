-- 1. Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    active_users INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Messages table
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
    "user" TEXT NOT NULL,
    content TEXT NOT NULL,
    system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 4. Minimal policies
CREATE POLICY "allow anon select" ON rooms FOR SELECT USING (true);
CREATE POLICY "allow anon insert" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "allow anon select" ON messages FOR SELECT USING (true);
CREATE POLICY "allow anon insert" ON messages FOR INSERT WITH CHECK (true);

-- 5. Trigger function to update active_users on system messages
CREATE OR REPLACE FUNCTION update_active_users()
RETURNS TRIGGER AS $$
BEGIN
    -- Only system messages for join/leave affect active_users
    IF NEW.system THEN
        IF NEW.content LIKE '%joined%' THEN
            UPDATE rooms SET active_users = active_users + 1 WHERE id = NEW.room_id;
        ELSIF NEW.content LIKE '%left%' THEN
            UPDATE rooms SET active_users = active_users - 1 WHERE id = NEW.room_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create trigger on messages insert
CREATE TRIGGER trigger_update_active_users
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_active_users();