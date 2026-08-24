const productAreas = ["Discover", "Trend Cards", "Design Studio", "Deep-dive"];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
        Printerval
      </p>
      <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-950 sm:text-6xl">
        AI design intelligence for rising opportunities.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
        Find accelerating niches, understand demand, and move from an opportunity to a draft design.
      </p>
      <nav aria-label="Product areas" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {productAreas.map((area) => (
          <div key={area} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
            <p className="mt-3 font-medium text-slate-900">{area}</p>
          </div>
        ))}
      </nav>
    </main>
  );
}
