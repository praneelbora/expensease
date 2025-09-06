// assets/icons/index.js

// Imports (each SVG is turned into a React component by your bundler)
import Activities from "./activities.svg?react";
import Apple from "./apple.svg?react";
import Baby from "./baby.svg?react";
import Bank from "./bank.svg?react";
import Bike from "./bike.svg?react";
import Bitcoin from "./bitcoin.svg?react";
import Bone from "./bone.svg?react";
import Books from "./books.svg?react";
import Calendar from "./calendar.svg?react";
import Calls from "./calls.svg?react";
import Car from "./car.svg?react";
import CoinDollar from "./coinDollar.svg?react";
import Coins from "./coins.svg?react";
import Devices from "./devices.svg?react";
import Dinner from "./dinner.svg?react";
import Doctor from "./doctor.svg?react";
import Dollar from "./dollar.svg?react";
import Electricity from "./electricity.svg?react";
import Electronics from "./electronics.svg?react";
import Euro from "./euro.svg?react";
import Film from "./film.svg?react";
import Furniture from "./furniture.svg?react";
import Games from "./games.svg?react";
import Gift from "./gift.svg?react";
import Groceries from "./groceries.svg?react";
import Handshake from "./handshake.svg?react";
import Health from "./health.svg?react";
import Heart from "./heart.svg?react";
import House from "./house.svg?react";
import Inr from "./inr.svg?react";
import Invest from "./invest.svg?react";
import Keyboard from "./keyboard.svg?react";
import Lamp from "./lamp.svg?react";
import Laptop from "./laptop.svg?react";
import Liquor from "./liquor.svg?react";
import Luggage from "./luggage.svg?react";
import Movies from "./movies.svg?react";
import Music from "./music.svg?react";
import Notepad from "./notepad.svg?react";
import People from "./people.svg?react";
import Pet from "./pet.svg?react";
import PiggyBank from "./piggyBank.svg?react";
import Pizza from "./pizza.svg?react";
import Platter from "./platter.svg?react";
import Popcorn from "./popcorn.svg?react";
import Rose from "./rose.svg?react";
import Settings from "./settings.svg?react";
import Shirt from "./shirt.svg?react";
import Sports from "./sports.svg?react";
import Supplies from "./supplies.svg?react";
import Shopping from "./shopping.svg?react";
import Tools from "./tools.svg?react";
import Tv from "./tv.svg?react";
import Wallet from "./wallet.svg?react";
import Wallet2 from "./wallet2.svg?react";
import Wheel from "./wheel.svg?react";
import Wifi from "./wifi.svg?react";
import Wine from "./wine.svg?react";
import Building from "./building.svg?react";
import Church from "./church.svg?react";
import Shield from "./shield.svg?react";

import DefaultIcon from "./notepad.svg?react";

// Centralized icon map
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
  coindollar: CoinDollar,
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
  piggybank: PiggyBank,
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
};

// Safe getter
// assets/icons/index.js
export const getIconForCategory = (category) => {
  if (!category) return DefaultIcon;
  const key = String(category).toLowerCase();
  if (!iconMap[key]) {
    // console.warn(`No icon found for category "${category}"`);
    return DefaultIcon
  }
  return iconMap[key] || DefaultIcon;
};
