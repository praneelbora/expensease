import React from "react";
import { Link } from "react-router-dom";
import { Mail, Twitter, Linkedin } from "lucide-react";

const Footer = () => {
    return (
        <footer className="bg-[#212121] text-gray-300 py-12 px-12">
            <div className="max-w-full flex flex-col md:flex-row gap-8 justify-between">

                {/* About + Connect Section */}
                <div className="flex-1/3">
                    <h3 className="text-[#EBF1D5] text-lg font-semibold mb-4">Expensease</h3>
                    <p className="text-sm mb-4">
                        Split expenses effortlessly. Track your personal and shared spending.
                        Gain insights and stay on top of your finances.
                    </p>

                    <div>
                        <h4 className="text-[#EBF1D5] text-sm font-semibold mb-3">Connect with us</h4>
                        <div className="flex gap-4 items-center">
                            {/* <a
                href="https://twitter.com/expensease"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#EBF1D5] transition"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                href="https://www.linkedin.com/company/expensease"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#EBF1D5] transition"
              >
                <Linkedin className="w-5 h-5" />
              </a> */}
                            <a
                                href="mailto:email.expensease@gmail.com"
                                className="hover:text-[#EBF1D5] transition"
                            >
                                <Mail className="w-5 h-5" />
                            </a>
                        </div>
                    </div>
                </div>

                {/* Quick Links Section */}
                <div className="flex-1/2">
                    <h3 className="text-[#EBF1D5] text-lg font-semibold mb-4">Quick Links</h3>
                    <div className="flex flex-row">
                        <div className="flex-1">
                            <ul className="space-y-2 text-sm">
                                <li>
                                    <Link to="/" className="hover:text-[#EBF1D5] transition">Home</Link>
                                </li>
                                <li>
                                    <Link to="/about" className="hover:text-[#EBF1D5] transition">About</Link>
                                </li>
                                <li>
                                    <Link to="/features" className="hover:text-[#EBF1D5] transition">Features</Link>
                                </li>
                                <li>
                                    <Link to="/faqs" className="hover:text-[#EBF1D5] transition">FAQ</Link>
                                </li>

                            </ul>
                        </div>
                        <div className="flex-1">
                            <ul className="space-y-2 text-sm">
                                <li>
                                    <Link to="/blogs" className="hover:text-[#EBF1D5] transition">Blogs</Link>
                                </li>
                                <li>
                                    <Link to="/contact" className="hover:text-[#EBF1D5] transition">Contact Us</Link>
                                </li>
                                <li>
                                    <Link to="/privacy" className="hover:text-[#EBF1D5] transition">Privacy Policy</Link>
                                </li>
                                <li>
                                    <Link to="/terms" className="hover:text-[#EBF1D5] transition">Terms & Conditions</Link>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

            </div>

            <hr className="border-gray-700 my-8" />

            <div className="text-center text-sm text-gray-500">
                &copy; {new Date().getFullYear()} Expensease. All rights reserved.
            </div>
        </footer>
    );
};

export default Footer;
