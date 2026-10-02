export const ROLES = ['USER', 'ORGANIZER', 'STAFF', 'ADMIN'];
export function publicUser(user) {
    const { password_hash: _password, ...safe } = user;
    return safe;
}
