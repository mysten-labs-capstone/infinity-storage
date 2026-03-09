import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

// Used Emojis: 💬 ❗

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // apiVersion: "2025-11-17.clover",
});

export async function POST(req: NextRequest) {
  try {
    const { userId, priceId, redirectAfter } = await req.json();

    if (!userId || !priceId) {
      return NextResponse.json(
        { error: "Missing userId or amount" },
        { status: 400 },
      );
    }

    // Build success URL, preserving any redirect-after-payment context
    const successParams = new URLSearchParams({
      session_id: "{CHECKOUT_SESSION_ID}",
    });
    if (redirectAfter && typeof redirectAfter === "string") {
      successParams.set("redirect_after", redirectAfter);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId,
      },
      success_url: `${process.env.FRONTEND_URL}/Payment?${successParams.toString()}`,
      cancel_url: `${process.env.FRONTEND_URL}/Payment`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("❗ Stripe session error:", error);
    return NextResponse.json(
      { error: "Failed to create Stripe session" },
      { status: 500 },
    );
  }
}
