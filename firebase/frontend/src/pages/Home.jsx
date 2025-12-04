export default function Home() {
  return (
    <section className="pt-20">
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-75px)] text-center">
        <h1 className="text-4xl font-bold text-bluebrand mb-4">
          Welcome to InstaFix
        </h1>
        <p className="text-lg text-gray-600 mb-6">
          Your one-stop shop all your service needs.
        </p>
        <button className="bg-bluebrand border text-white px-6 py-2 rounded-md tra
        sition signUpButton">
          Find Your Technician Now
        </button>
      </div>

    </section>
  );
}
