import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("http://localhost:5050/api/services", {
      method: "GET",
      credentials: "include",
    })
      .then(res => {
        if (res.status === 401) {
          navigate("/login"); // Not logged in → redirect to login
        }
        return res.json();
      })
      .then(data => setServices(data))
      .catch(err => console.error(err));
  }, [navigate]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center">Our Services</h1>
  
      {services.length === 0 ? (
        <p className="text-center text-gray-500">No services available at the moment.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <li
              key={service.id}
              className="border p-4 rounded-lg shadow hover:shadow-md transition"
            >
              <h2 className="font-semibold text-lg">{service.name}</h2>
              <p className="text-gray-700">${service.price}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
