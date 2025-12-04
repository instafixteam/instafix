--Create Roles table to define user roles
CREATE TABLE IF NOT EXISTS User_Role (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
);

--Create Resources table to define application resources
CREATE TABLE IF NOT EXISTS App_Resource (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
);

--Create Permissions table to link roles and resources with specific permissions
CREATE TABLE IF NOT EXISTS Permissions ( 
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES User_Role(id) ON DELETE CASCADE,
    resource_id INT REFERENCES App_Resource(id) ON DELETE CASCADE,
    can_read BOOLEAN DEFAULT FALSE,
    can_write BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,
    can_update BOOLEAN DEFAULT FALSE,
    UNIQUE(role_id, resource_id)
);

--Seed initial roles
INSERT INTO User_Role (name) VALUES 
('admin'),
('customer'),
('technician');
ON CONFLICT (name) DO NOTHING;

--Seed initial resources
INSERT INTO App_Resource (name) VALUES 
('dashboard_admin'),
('dashboard_technician'),
('user_management'),
('service_catalogue'),
('reviews')
('service_history');
('service_requests');
('payments');
('technician_onboarding')
('notifications')
('orders')
('profile_self')
ON CONFLICT (name) DO NOTHING;

--Seed initial permissions
INSERT INTO Permissions (role_id, resource_id, can_read, can_write, can_delete, can_update) VALUES
--admin permissions
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='dashboard_admin'), TRUE, TRUE, TRUE, TRUE),
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='user_management'), TRUE, TRUE, TRUE, TRUE),
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='service_catalogue'), TRUE, TRUE, TRUE, TRUE),
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='reviews'), TRUE, FALSE, FALSE, FALSE),
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='service_requests'), TRUE, TRUE, TRUE, TRUE),
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='payments'), TRUE, TRUE, TRUE, TRUE),
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='technician_onboarding'), TRUE, TRUE, FALSE, FALSE),
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='notifications'), TRUE, TRUE, TRUE, TRUE),
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='service_history'), TRUE, TRUE, TRUE, TRUE),
((SELECT id FROM User_Role WHERE name='admin'), (SELECT id FROM App_Resource WHERE name='orders'), TRUE, TRUE, TRUE, TRUE),


--customer permissions
((SELECT id FROM User_Role WHERE name='customer'), (SELECT id FROM App_Resource WHERE name='service_catalogue'), TRUE, FALSE, FALSE, FALSE),
((SELECT id FROM User_Role WHERE name='customer'), (SELECT id FROM App_Resource WHERE name='reviews'), FALSE, TRUE, FALSE, FALSE),
((SELECT id FROM User_Role WHERE name='customer'), (SELECT id FROM App_Resource WHERE name='service_history'), TRUE, FALSE, FALSE, FALSE), --customer will only see their previous orders
((SELECT id FROM User_Role WHERE name='customer'), (SELECT id FROM App_Resource WHERE name='service_requests'), TRUE, TRUE, FALSE, FALSE), --customer can create and view their service requests
((SELECT id FROM User_Role WHERE name='customer'), (SELECT id FROM App_Resource WHERE name='payments'), TRUE, TRUE, FALSE, FALSE), --customer can view and make payments
((SELECT id FROM User_Role WHERE name='customer'), (SELECT id FROM App_Resource WHERE name='notifications'), TRUE, FALSE, FALSE, FALSE); -- customer can view notifications
((SELECT id FROM User_Role WHERE name='customer'), (SELECT id FROM App_Resource WHERE name='profile_self'), TRUE, FALSE, FALSE, TRUE); -- customer can view and update their profile

--technician permissions
((SELECT id FROM User_Role WHERE name='technician'), (SELECT id FROM App_Resource WHERE name='service_history'), TRUE, TRUE, FALSE, FALSE), -- technicians can view service history
((SELECT id FROM User_Role WHERE name='technician'), (SELECT id FROM App_Resource WHERE name='dashboard_technician'), TRUE, TRUE, FALSE, FALSE); -- technicians can access their dashboard
((SELECT id FROM User_Role WHERE name='technician'), (SELECT id FROM App_Resource WHERE name='payments'), TRUE, FALSE, FALSE, FALSE); -- technicians can view their payouts but cannot modify
((SELECT id FROM User_Role WHERE name='technician'), (SELECT id FROM App_Resource WHERE name='notifications'), TRUE, FALSE, FALSE, FALSE); -- technicians can view notifications
((SELECT id FROM User_Role WHERE name='technician'), (SELECT id FROM App_Resource WHERE name='service_requests'), TRUE, TRUE, FALSE, FALSE); --technicians can view and accept/reject service requests assigned to them
((SELECT id FROM User_Role WHERE name='technician'), (SELECT id FROM App_Resource WHERE name='orders'), TRUE, FALSE, FALSE, FALSE); -- technicians can view their assigned orders
((SELECT id FROM User_Role WHERE name='technician'), (SELECT id FROM App_Resource WHERE name='profile_self'), TRUE, FALSE, FALSE, TRUE); -- technicians can view and update their profile
ON CONFLICT (role_id, resource_id) DO NOTHING;

