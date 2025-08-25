import React from "react";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import { Users, DollarSign, Shield } from "lucide-react";
import Footer from "../../components/Footer";

const About = () => {
  return (
    <>
      <SEO
        title="About | Expensease"
        description="Learn more about Expensease, our mission, and how we help you track expenses."
      />
      <NavBar />
            <div className="min-h-[100dvh] bg-[#121212] p-12 pt-[120px]">
        <div className="max-w-5xl mx-auto text-center space-y-10 text-white">

          {/* Hero Section */}
          <div className="space-y-4">
            <h1 className="text-5xl font-bold">About Expensease</h1>
            <p className="text-lg max-w-3xl mx-auto">
              Expensease is designed to simplify expense tracking and sharing. Split bills with friends,
              manage personal expenses, and get insights into your spending—all in one place.
            </p>
          </div>

          {/* Mission & Values */}
          <div className="grid md:grid-cols-2 gap-8 text-left">
            <div className="bg-[#1a1a1a] p-6 rounded-xl shadow hover:shadow-lg transition">
              <Users className="mx-auto mb-4 text-teal-400" size={40} />
              <h2 className="text-xl font-semibold mb-2">Community First</h2>
              <p>We focus on making shared expenses easy and transparent for friends, families, and teams.</p>
            </div>
            <div className="bg-[#1a1a1a] p-6 rounded-xl shadow hover:shadow-lg transition">
              <DollarSign className="mx-auto mb-4 text-teal-400" size={40} />
              <h2 className="text-xl font-semibold mb-2">Financial Clarity</h2>
              <p>Visualize your spending, track budgets, and gain insights to make smarter financial decisions.</p>
            </div>
          </div>

          {/* Team / Story Section */}
          <div className="space-y-6 text-center">
            <h2 className="text-3xl font-bold">Our Story</h2>
            <p>
              Expensease was born out of the need to make splitting expenses simple, fair, and stress-free.
              We believe that managing money should be effortless and accessible for everyone.
            </p>
          </div>

          {/* Call to Action */}
          <div className="mt-10">
            <a
              href="/signup"
              className="inline-block bg-teal-500 text-[#121212] font-bold px-8 py-4 rounded-lg text-lg hover:bg-teal-600 transition"
            >
              Get Started for Free
            </a>
          </div>

        </div>
      </div>
      <Footer />
    </>
  );
};

export default About;
