import MainLayout from "../layouts/MainLayout";

import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
const upiId = import.meta.env.VITE_UPI_ID;
const buymeacoffee = import.meta.env.VITE_BUYMEACOFFEE_URL;
export default function Support() {
    const navigate = useNavigate();
    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                <div className="bg-[#121212] sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5] flex flex-row justify-between">
                    <div className="flex flex-row gap-2">
                        <button onClick={() => navigate(`account`)}>
                            <ChevronLeft />
                        </button>
                        <h1 className="text-3xl font-bold capitalize">Support Developer</h1>
                    </div>
                </div>

                <div className="flex flex-col flex-1 w-full overflow-y-auto pt-3 no-scrollbar">
                    <div className="flex-1 overflow-y-auto no-scrollbar space-y-6">
                        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                            <p className="text-[#888] text-sm leading-relaxed">
                                Hey 👋 I’m building this platform independently during nights and weekends.
                                If you’ve found value in it and want to support continued development (and a coffee or two ☕),
                                you can contribute below. Every bit helps — thank you! ❤️
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* UPI Support */}
                            <div className="bg-[#1E1E1E] p-4 rounded-xl shadow flex flex-col gap-2">
                                <h2 className="text-xl font-semibold">UPI (India)</h2>
                                <p className="text-[#888] text-sm">Scan the QR or send directly via UPI:</p>
                                <img src='/private/phonepe.jpg' alt="UPI QR Code" className="w-40 h-40 object-contain rounded" />
                                <p className="text-[#888] text-sm mt-2">UPI ID: <span className="font-mono">{upiId}</span></p>
                            </div>

                            {/* BuyMeACoffee or Ko-fi */}
                            <div className="bg-[#1E1E1E] p-4 rounded-xl shadow flex flex-col gap-2">
                                <h2 className="text-xl font-semibold">Global Support</h2>
                                <p className="text-[#888] text-sm">
                                    Prefer international platforms?
                                </p>
                                <a
                                    href={buymeacoffee}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    <img
                                        src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                                        alt="Buy Me A Coffee"
                                        className="w-[217px] h-[60px]"
                                    />
                                </a>

                            </div>
                        </div>

                        {/* Future Plans */}
                        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                            <h2 className="text-xl font-semibold mb-2">What Your Support Helps With</h2>
                            <ul className="list-disc list-inside text-[#888] text-sm space-y-1">
                                <li>Server & hosting costs</li>
                                <li>Building new features faster</li>
                                <li>Keeping the app free and ad-free</li>
                                <li>Buying coffee to stay up late and fix bugs ☕</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
