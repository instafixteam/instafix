// middleware/requireSelf.js

export function requireSelf(paramName = "uid") {

    return (req, res, next) => {
        const tokenUid = req.user?.uid;
        const targetUid = req.params?.[paramName];

        // Debug logs (remove in prod)
        console.log("[requireSelf] tokenUid:", tokenUid, "targetUid:", targetUid);

        if (!tokenUid) {
            return res.status(401).json({ message: "Unauthorized: missing token uid" });
        }
        if (!targetUid) {
            return res.status(400).json({ message: `Bad request: missing path param :${paramName}` });
        }
        if (String(tokenUid) !== String(targetUid)) {
            return res.status(403).json({ message: "Forbidden: not your profile" });
        }
        return next();
    };
}
