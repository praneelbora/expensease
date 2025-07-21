import MainLayout from "../layouts/MainLayout";

export default function Support() {
    return (
        <MainLayout>
            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col">
                <div className="sticky -top-[5px] z-10 pb-2 border-b border-[#EBF1D5]">
                    <h1 className="text-3xl font-bold">Support the Developer</h1>
                </div>

                <div className="flex-1 overflow-y-auto pt-4 no-scrollbar space-y-6">
                    <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                        <p className="text-[#BBBBBB] text-sm leading-relaxed">
                            Hey 👋 I’m building this platform independently during nights and weekends.
                            If you’ve found value in it and want to support continued development (and a coffee or two ☕),
                            you can contribute below. Every bit helps — thank you! ❤️
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* UPI Support */}
                        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow flex flex-col gap-2">
                            <h2 className="text-xl font-semibold">UPI (India)</h2>
                            <p className="text-[#BBBBBB] text-sm">Scan the QR or send directly via UPI:</p>
                            <img src="/images/upi-qr.png" alt="UPI QR Code" className="w-40 h-40 object-contain rounded" />
                            <p className="text-[#BBBBBB] text-sm mt-2">UPI ID: <span className="font-mono">yourupiid@upi</span></p>
                        </div>

                        {/* BuyMeACoffee or Ko-fi */}
                        <div className="bg-[#1E1E1E] p-4 rounded-xl shadow flex flex-col gap-2">
                            <h2 className="text-xl font-semibold">Global Support</h2>
                            <p className="text-[#BBBBBB] text-sm">
                                Prefer international platforms?
                            </p>
                            <a
                                href="https://www.buymeacoffee.com/praneel"
                                target="_blank"
                                rel="noreferrer"
                                className="bg-yellow-500 text-black text-center px-4 py-2 rounded font-semibold hover:bg-yellow-600"
                            >
                                Buy Me a Coffee ☕
                            </a>
                            <a
                                href="https://ko-fi.com/praneel"
                                target="_blank"
                                rel="noreferrer"
                                className="bg-pink-500 text-white text-center px-4 py-2 rounded font-semibold hover:bg-pink-600"
                            >
                                Support via Ko-fi 💖
                            </a>
                        </div>
                    </div>

                    {/* Future Plans */}
                    <div className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                        <h2 className="text-xl font-semibold mb-2">What Your Support Helps With</h2>
                        <ul className="list-disc list-inside text-[#BBBBBB] text-sm space-y-1">
                            <li>Server & hosting costs</li>
                            <li>Building new features faster</li>
                            <li>Keeping the app free and ad-free</li>
                            <li>Buying coffee to stay up late and fix bugs ☕</li>
                        </ul>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
