export default function Home({ message }: { message: string }) {
  return (
    <div>
      <h1>{message}</h1>
      <p>This page is rendered with Inertia.js and Stratal.</p>
    </div>
  )
}
