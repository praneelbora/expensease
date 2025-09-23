// assets/icons/index.js

// Import only once here
import Activities from "./activities.svg";
import Apple from "./apple.svg";
import Baby from "./baby.svg";
import Bank from "./bank.svg";
import Bike from "./bike.svg";
import Bitcoin from "./bitcoin.svg";
import Bone from "./bone.svg";
import Books from "./books.svg";
import Calendar from "./calendar.svg";
import Calls from "./calls.svg";
import Car from "./car.svg";
import CoinDollar from "./coinDollar.svg";
import Coins from "./coins.svg";
import Devices from "./devices.svg";
import Dinner from "./dinner.svg";
import Doctor from "./doctor.svg";
import Dollar from "./dollar.svg";
import Electricity from "./electricity.svg";
import Electronics from "./electronics.svg";
import Euro from "./euro.svg";
import Film from "./film.svg";
import Furniture from "./furniture.svg";
import Games from "./games.svg";
import Gift from "./gift.svg";
import Groceries from "./groceries.svg";
import Handshake from "./handshake.svg";
import Health from "./health.svg";
import Heart from "./heart.svg";
import House from "./house.svg";
import Inr from "./inr.svg";
import Invest from "./invest.svg";
import Keyboard from "./keyboard.svg";
import Lamp from "./lamp.svg";
import Laptop from "./laptop.svg";
import Liquor from "./liquor.svg";
import Luggage from "./luggage.svg";
import Movies from "./movies.svg";
import Music from "./music.svg";
import Notepad from "./notepad.svg";
import People from "./people.svg";
import Pet from "./pet.svg";
import PiggyBank from "./piggyBank.svg";
import Pizza from "./pizza.svg";
import Platter from "./platter.svg";
import Popcorn from "./popcorn.svg";
import Rose from "./rose.svg";
import Settings from "./settings.svg";
import Shirt from "./shirt.svg";
import Sports from "./sports.svg";
import Supplies from "./supplies.svg";
import Shopping from "./shopping.svg";
import Tools from "./tools.svg";
import Tv from "./tv.svg";
import Wallet from "./wallet.svg";
import Wallet2 from "./wallet2.svg";
import Wheel from "./wheel.svg";
import Wifi from "./wifi.svg";
import Wine from "./wine.svg";
import Building from "./building.svg";
import Church from "./church.svg";
import Shield from "./shield.svg";
import File from "./file.svg";

import DefaultIcon from "./notepad.svg"; // <-- add a generic fallback icon

// Create a dictionary
export const iconMap = {
  activities: Activities,
  apple: Apple,
  baby: Baby,
  bank: Bank,
  bike: Bike,
  bitcoin: Bitcoin,
  bone: Bone,
  books: Books,
  calendar: Calendar,
  calls: Calls,
  car: Car,
  coinDollar: CoinDollar,
  coins: Coins,
  devices: Devices,
  dinner: Dinner,
  doctor: Doctor,
  dollar: Dollar,
  electricity: Electricity,
  electronics: Electronics,
  euro: Euro,
  film: Film,
  furniture: Furniture,
  games: Games,
  gift: Gift,
  groceries: Groceries,
  handshake: Handshake,
  health: Health,
  heart: Heart,
  house: House,
  inr: Inr,
  invest: Invest,
  keyboard: Keyboard,
  lamp: Lamp,
  laptop: Laptop,
  liquor: Liquor,
  luggage: Luggage,
  movies: Movies,
  music: Music,
  notepad: Notepad,
  people: People,
  pet: Pet,
  piggyBank: PiggyBank,
  pizza: Pizza,
  platter: Platter,
  popcorn: Popcorn,
  rose: Rose,
  settings: Settings,
  shirt: Shirt,
  sports: Sports,
  supplies: Supplies,
  shopping: Shopping,
  tools: Tools,
  tv: Tv,
  wallet: Wallet,
  wallet2: Wallet2,
  wheel: Wheel,
  wifi: Wifi,
  wine: Wine,
  building: Building,
  church: Church,
  shield: Shield,
  default: File
};

// Helper
export const getIconForCategory = (category) => {
  const key = category?.toLowerCase();
  return iconMap[key] || DefaultIcon;
};
