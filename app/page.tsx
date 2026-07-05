"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StaticButton } from "@/components/better/static-button";

const CREDITS = ["Kataaksh", "Bikash & Divyansh"];

export default function Landing() {
  const router = useRouter();
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    router.prefetch("/room");
  }, [router]);

  const enter = () => {
    setEntering(true);
    router.push("/room");
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-6 text-center">
      <div className="relative z-10 flex flex-col items-center">
        <h1
          className="select-none text-7xl leading-none text-white sm:text-8xl md:text-[10rem]"
          style={{ fontFamily: '"Bitcount Prop Single", monospace' }}
        >
          Rooms
        </h1>

        <div className="mt-12">
          <StaticButton
            variant="primary"
            size="md"
            radius={16}
            onClick={enter}
            disabled={entering}
          >
            {entering ? "Entering…" : "Enter Room"}
          </StaticButton>
        </div>
      </div>

      <p className="absolute bottom-8 z-10 flex items-center gap-2 font-mono text-sm text-white/70 sm:text-base">
        Built by <AnimatedCredit />
      </p>
    </main>
  );
}

function AnimatedCredit() {
  const [i, setI] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    const swap = setInterval(() => {
      setShow(false);
      setTimeout(() => {
        setI((v) => (v + 1) % CREDITS.length);
        setShow(true);
      }, 350);
    }, 2600);
    return () => clearInterval(swap);
  }, []);

  return (
    <span
      className="inline-block min-w-[10ch] font-semibold text-[#0072ff] transition-all duration-300"
      style={{ opacity: show ? 1 : 0, transform: show ? "translateY(0)" : "translateY(-6px)" }}
    >
      {CREDITS[i]}
    </span>
  );
}
