import { useAuth } from '../context/AuthContext';
import MainLayout from '../layouts/MainLayout';
import Cookies from 'js-cookie'

const Account = () => {
    const { logout, user } = useAuth() // assuming `user` contains logged in user details
    return (
        <MainLayout>
            <div className="text-[#EBF1D5] bg-[#121212] max-h-screen flex flex-col grow h-full">
                <h1 className="text-3xl font-bold mb-6">My Account</h1>

                {(user || Cookies.get('userToken')) ? (
                    <div className="flex flex-col grow h-full gap-4">
                        <div>
                            <p className="text-lg font-semibold">Name</p>
                            <p className="text-base text-[#BBBBBB]">{user?.name}</p>
                        </div>
                        <div>
                            <p className="text-lg font-semibold">Email</p>
                            <p className="text-base text-[#BBBBBB]">{user?.email}</p>
                        </div>
                        <div className='flex flex-col w-full h-max grow justify-end'>
                            <button className='text-red-500 border-1 border-red-500 p-2 rounded-md' onClick={() => logout()}>Logout</button>
                        </div>
                        {/* You can add more user fields here */}
                    </div>
                ) : (
                    <p className="text-red-500">User not logged in.</p>
                )}
            </div>
        </MainLayout>
    );
};

export default Account;
