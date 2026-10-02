export function validateRequest(schema) {
    return (req, _res, next) => { req.body = schema.parse(req.body); next(); };
}
