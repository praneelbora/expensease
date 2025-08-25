import { Twitter } from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";

const Footer = () => {
    return (
        <footer className="bg-[#212121] text-gray-300 py-12 px-12">
            <div className="max-w-full flex flex-col md:flex-row gap-8 justify-between">
                {/* About Section */}
                <div className="flex-1">
                    <h3 className="text-white text-lg font-semibold mb-4">Expensease</h3>
                    <p className="text-sm">
                        Split expenses effortlessly. Track your personal and shared spending. Gain insights and stay on top of your finances.
                    </p>
                </div>

                {/* Links Section */}
                <div className="flex-1">
                    <h3 className="text-white text-lg font-semibold mb-4">Quick Links</h3>
                    <ul className="space-y-2 text-sm">
                        <li>
                            <Link to="/" className="hover:text-white transition">
                                Home
                            </Link>
                        </li>
                        <li>
                            <Link to="/features" className="hover:text-white transition">
                                Features
                            </Link>
                        </li>
                        <li>
                            <Link to="/faq" className="hover:text-white transition">
                                FAQ
                            </Link>
                        </li>
                        <li>
                            <Link to="/about" className="hover:text-white transition">
                                About
                            </Link>
                        </li>
                    </ul>
                </div>


                {/* <div>
          <h3 className="text-white text-lg font-semibold mb-4">Connect</h3>
          <div className="flex gap-4 text-xl">
            <a
              href="https://twitter.com/expensease"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="30" height="30" viewBox="0 0 50 50" style={{ fill: "#FFFFFF" }}>
<path d="M 11 4 C 7.1456661 4 4 7.1456661 4 11 L 4 39 C 4 42.854334 7.1456661 46 11 46 L 39 46 C 42.854334 46 46 42.854334 46 39 L 46 11 C 46 7.1456661 42.854334 4 39 4 L 11 4 z M 11 6 L 39 6 C 41.773666 6 44 8.2263339 44 11 L 44 39 C 44 41.773666 41.773666 44 39 44 L 11 44 C 8.2263339 44 6 41.773666 6 39 L 6 11 C 6 8.2263339 8.2263339 6 11 6 z M 13.085938 13 L 22.308594 26.103516 L 13 37 L 15.5 37 L 23.4375 27.707031 L 29.976562 37 L 37.914062 37 L 27.789062 22.613281 L 36 13 L 33.5 13 L 26.660156 21.009766 L 21.023438 13 L 13.085938 13 z M 16.914062 15 L 19.978516 15 L 34.085938 35 L 31.021484 35 L 16.914062 15 z"></path>
</svg>
            </a>
            <a
              href="https://www.linkedin.com/company/expensease"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition"
            >
              🔗
            </a>
            <a
              href="mailto:support@expensease.in"
              className="hover:text-white transition"
            >
              ✉️
            </a>
          </div>
          </div> */}
            </div>

            <hr className="border-gray-700 my-8" />

            <div className="text-center text-sm text-gray-500">
                &copy; {new Date().getFullYear()} Expensease. All rights reserved.
            </div>
        </footer>
    );
};

export default Footer;
