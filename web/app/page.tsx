import { Logo } from "@/components/Logo";

/** Placeholder home: the real landing is W-10. */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 px-4 py-12">
      <Logo />
      <h1 className="text-display font-semibold">Pagá protegido</h1>
      <p className="text-steel">Tu plata queda en bóveda hasta que confirmes que llegó.</p>
    </main>
  );
}
