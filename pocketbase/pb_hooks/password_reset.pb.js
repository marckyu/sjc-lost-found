/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/request-otp", (c) => {
    const data = $apis.requestInfo(c).data;
    const email = (data.email || "").toLowerCase().trim();

    if (!email) {
        return c.json(400, { error: "Email required" });
    }

    try {
        const user = $app.findAuthRecordByEmail("users", email);
        
        if (user) {
            const otpCode = $security.randomStringWithAlphabet(6, "0123456789");
            
            const otpRecord = new Record($app.findCollectionByNameOrId("otp_codes"));
            otpRecord.set("email", email);
            otpRecord.set("code", otpCode);
            
            const now = new Date();
            now.setMinutes(now.getMinutes() + 10);
            otpRecord.set("expiresAt", now.toISOString());

            $app.save(otpRecord);

            const message = new MailerMessage({
                from: {
                    address: $app.settings().meta.senderAddress,
                    name: $app.settings().meta.senderName,
                },
                to: [{ address: email }],
                subject: "SJC Lost & Found - Password Reset OTP",
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px;">
                        <h2 style="color: #166534;">Password Reset Request</h2>
                        <p>Hi <strong>${user.getString("fullname") || "User"}</strong>,</p>
                        <p>Your One-Time Password (OTP) to reset your account is:</p>
                        <div style="background: #f0fdf4; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0; border: 1px solid #bbf7d0;">
                            <h1 style="margin: 0; color: #166534; letter-spacing: 5px;">${otpCode}</h1>
                        </div>
                        <p>This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
                    </div>
                `,
            });

            try {
                $app.newMailClient().send(message);
                console.log("OTP sent to: " + email);
            } catch (err) {
                console.log("Failed to send email:", err);
            }
        }
    } catch (err) {
        console.log("OTP requested for non-existent user: " + email);
    }

    return c.json(200, { message: "If an account exists, an OTP has been sent." });
});

routerAdd("POST", "/api/verify-otp", (c) => {
    const data = $apis.requestInfo(c).data;
    const email = (data.email || "").toLowerCase().trim();
    const otpCode = (data.otp || "").trim();
    const newPassword = data.password;

    if (!email || !otpCode || !newPassword) {
        return c.json(400, { error: "Email, OTP, and new password are required" });
    }
    if (newPassword.length < 6) {
        return c.json(400, { error: "Password must be at least 6 characters" });
    }

    try {
        const otpRecord = $app.findFirstRecordByFilter("otp_codes", 
            "email = {:email} && code = {:code}", 
            { email: email, code: otpCode }
        );

        const expiresAt = new Date(otpRecord.get("expiresAt"));
        if (new Date() > expiresAt) {
            return c.json(400, { error: "OTP has expired" });
        }

        const user = $app.findAuthRecordByEmail("users", email);
        user.setPassword(newPassword);
        $app.save(user);

        $app.delete(otpRecord);

        return c.json(200, { success: true, message: "Password successfully reset" });
    } catch (err) {
        return c.json(400, { error: "Invalid OTP code" });
    }
});