const XLSX = require('xlsx');

const data = [
  {
    productName: "لنت ترمز جلو",
    brand: "تکستار",
    vehicleModel: "پراید",
    partNumber: "TX-101",
    unit: "عدد",
    purchasePrice: 1500000,
    salePrice: 2000000,
    wholesalePrice: 1800000,
    quantity: 10
  },
  {
    productName: "فیلتر روغن جدید",
    brand: "برند تست",
    vehicleModel: "خودرو تست",
    partNumber: "FL-999",
    unit: "عدد",
    purchasePrice: 50000,
    salePrice: 80000,
    wholesalePrice: 70000,
    quantity: 20
  }
];

const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
XLSX.writeFile(workbook, "test.xlsx");
console.log("فایل test.xlsx ساخته شد.");
