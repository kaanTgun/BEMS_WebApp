const BEMS_API = 'https://bems-project-server.herokuapp.com/api/v1'
// const BEMS_API = 'http://127.0.0.1:5000/api/v1';
const data_path = 'Data/data.json';
let ctx = document.getElementById('chart_1').getContext('2d');
let ctx_2 = document.getElementById('chart_2').getContext('2d');

const StartIndex = 50;
const Steps = 48;
const soc = 0.6;

let barGraphData = {
	Rewards:[],
	Colors:[]
};
let Strategies;

class Enve {
	constructor(JsonData, initSOC) {
		this.batteryCapacity = 100;
		this.initSOC = initSOC;
		this.JsonData = JsonData;
		this.GraphedData = {
			StartIndex:StartIndex, 
			Steps:Steps,
			DataObj:{}
		};
		this.setGraphedData(this.GraphedData.StartIndex, this.GraphedData.Steps);
		document.getElementsByClassName('slider')[0].setAttribute('max', this.JsonData.length -100);
		document.getElementsByClassName('slider')[0].setAttribute('value', this.GraphedData.StartIndex);
	};
	setGraphedData(srtIndex, step) {
		this.GraphedData.StartIndex = parseInt(srtIndex);
		this.GraphedData.Steps = parseInt(step);

		let DataObj = {Time:[], Month:[], Date:'', Price:[]};
		try{
			const time_interval = this.JsonData.slice(this.GraphedData.StartIndex, this.GraphedData.StartIndex + this.GraphedData.Steps);
			time_interval.forEach(element => {
				DataObj.Price.push(parseFloat(element.HOEP)/1000);
				
				let date_time = new Date(element.Date);
				if (DataObj.Date !== date_time.getDate()) {
					DataObj.Date = date_time.getDate(); // TODO: Fix
				};
				DataObj.Month.push(date_time.getMonth() + date_time.getDay() * 0.1);
				DataObj.Time.push(date_time.getHours());
			});
			DataObj.Price.push(0.02);

			this.GraphedData.DataObj = DataObj;
			
		}catch(e){
			console.log(e);
		}
	};
};
class Actor {
	constructor(path, name, InitSOC, color_) {
		this.name = name;
		this.color=color_;
		this.Path = path;
		this.Sess = new onnx.InferenceSession();
		this.ModelPromise = this.Sess.loadModel(this.Path);
		this.GraphedData = {
			soc:InitSOC,
			SOCs:[InitSOC],
			Actions:[],
			color:color_
		}
		this.evalActor();
	};

	async evalActor(){
		await Environment;
		this.GraphedData.Actions = [];
		this.GraphedData.SOCs = [Environment.initSOC];

		for (let index = 0; index < Environment.GraphedData.DataObj.Time.length; index++) {
			let action = await this.updatePrediction([Environment.GraphedData.DataObj.Time[index], Environment.GraphedData.DataObj.Month[index], this.GraphedData.soc, Environment.GraphedData.DataObj.Price[index]]);

			if (0 === action && this.GraphedData.soc+0.1 < 0.8 ){
				this.GraphedData.soc += 0.1;
			};
			if (1 === action && this.GraphedData.soc-0.1 > 0.2 ){
				this.GraphedData.soc -= 0.1;
			};
			this.GraphedData.SOCs.push(this.GraphedData.soc);

			let coeff = 0;
			if ( 0 === action){
				// Buy 
				coeff = +0.1 
			};
			if (1 === action){
				// Sell
				coeff = -0.1 
			};
			this.GraphedData.Actions.push(coeff);
		};
	}

	async updatePrediction(ls_observations) {
		let input = new onnx.Tensor(new Float32Array(ls_observations), 'float32', [1,4]);
		await this.ModelPromise;
		const outputMap = await this.Sess.run([input]);
		let predictions = outputMap.values().next().value.data;
		return predictions.indexOf(Math.max(...predictions));
	};

};
class LineGraph{
	constructor(ctx) {
		this.chart = new Chart(ctx, {
			type: 'line',
			data: {
				labels: Environment.GraphedData.DataObj.Time,
				datasets: [
					{
						label: 'Electricity Price (WWh/$)',
						data: Environment.GraphedData.DataObj.Price.map(x => x*1000),
						yAxisID: 'left-y-axis',
	
						borderWidth: 1,
						pointRadius: 1,
						lineTension:0,
						backgroundColor: 'rgb(255, 99, 132)',
						borderColor: 'rgb(255, 99, 132)',
						fill: false
					}
				]
			},
			options: {
				title:{
					text:'Electricity Rates vs Simulated Battery SOCs',
					fontSize:16,
					display:true
				},
				scales: {
					xAxes: {
						scaleLabel: {
							display: true,
							labelString: 'Hours'
						},
					},
					yAxes: [
						{
							id: 'left-y-axis',
							type: 'linear',
							position: 'left',
							scaleLabel: {
								display: true,
								labelString: 'MWh/$' 
							}
							
						},
						{
							id: 'right-y-axis',
							type: 'linear',
							position: 'right',
							scaleLabel: {
								display: true,
								labelString: 'BatteryCharge' 
							},
							ticks: {
                max: 1,
                min: 0,
							}
						}
					]
				}
			}
		});
	}
	getLabelIndexes() {
		let graphLabels = {};
		for (const index in this.chart.data.datasets) {
			const lbl = this.chart.data.datasets[index].label;
			graphLabels[`${lbl}`] = index;
		};
		return graphLabels;
	};
	updateGraph(label, strategy ,colorRGB, action) {
		const graphLabels = this.getLabelIndexes();

		// Add the given strategy to the main plot
		if (!(label in graphLabels) && null !== Strategies[label] ){
			if (action){
				this.chart.data.datasets.push({
					label: label,
					yAxisID: 'right-y-axis',
		
					data: strategy.SOCs,
					borderWidth: 2,
					pointRadius: 1,
					lineTension:0,
					backgroundColor: colorRGB,
					borderColor: colorRGB,
					fill: false
				});
			}
		}
		// Remove the strategy from the main plot
		if (label in graphLabels){
			if (!action){
				this.chart.data.datasets.splice(graphLabels[`${label}`], 1);
			};
		};
		this.chart.update();
	};
};
class BarGraph{
	constructor(ctx) {
		this.chart = new Chart(ctx, {
			type: 'bar',
			data: {
				labels: Object.keys(Strategies),
				datasets: [
					{
						label:'Reward $',
						data: barGraphData.Rewards,
						backgroundColor: barGraphData.Colors,
						borderColor: barGraphData.Colors
					}]
				},
				options: {
					title:{
						fontSize:16,
						display:true
					},
					scales: {
						yAxes: [{
							ticks: {
                max: Math.round(barGraphData.Rewards[0]),
								min:-20
							}},
						]
					},
				}
			}
		);
	};
};

async function fetchStrategies(URL){
	try {
		const linprog_url = `${URL}/linprog?soc=${Environment.initSOC}&index=${Environment.GraphedData.StartIndex}&len=${Environment.GraphedData.Steps}`;
		const linprog_resp = await fetch(linprog_url);
		linprog = await linprog_resp.json();
		linprog.SOCs.unshift(Environment.initSOC);
		linprog.color =  '#99EF7F';


		const ema_url = `${URL}/ema?soc=${Environment.initSOC}&index=${Environment.GraphedData.StartIndex}&len=${Environment.GraphedData.Steps}&window=6`;
		const ema_resp = await fetch(ema_url);
		ema = await ema_resp.json();
		ema.SOCs.unshift(Environment.initSOC);
		ema.color =  '#EFD57F';

		return {Linprog:linprog, EMA:ema}
	} catch (error) {
		console.error(error);
	}
};
async function loadData(path) {
	const response = await fetch(path);
	const data = response.json();
	return data;
};
async function clearCharts(){
	if(mainGraph.chart!=null){
		mainGraph.chart.destroy();
	}
	if(barGraph.chart!=null){
		barGraph.chart.destroy();
	}
	document.getElementById("LP_Checkbox").checked = false;
	document.getElementById("EMA_Checkbox").checked = false;
	document.getElementById("DQN_Checkbox").checked = false;
	document.getElementById("DDQN_Checkbox").checked = false;
	document.getElementById("chart_2_container").style.height = "300px";

	// Get the context of the canvas element we want to select
	mainGraph = await new LineGraph(ctx);
	document.getElementById("chart_1").style.display = "block";
	barGraph = await new BarGraph(ctx_2);

};
async function UpdateCalcs() { 
	// Using the current values of Enve variables, recalculate and graph (Whne the dates or hours change)
	Strategies 	= await fetchStrategies(BEMS_API);

	DDQN.evalActor();
	DQN.evalActor();

	Strategies['DDQN'] 	= DDQN.GraphedData;
	Strategies['DQN'] 	= DQN.GraphedData;

	// Calculate rewards can be achieved by fallowing the Strategies
	barGraphData.Colors = [];
	barGraphData.Rewards = [];
	for (const key in Strategies) {
		barGraphData.Rewards.push(CalcTotalReward(Strategies[`${key}`].Actions));
		barGraphData.Colors.push(Strategies[`${key}`].color);
	};

	if (typeof(mainGraph) == 'undefined'){
		// Get the context of the canvas element we want to select
		mainGraph = await new LineGraph(ctx);
		document.getElementById("chart_1").style.display = "block";
		document.getElementById("loader_1").style.display = "none";
		barGraph = await new BarGraph(ctx_2);
	}
	else{
		await clearCharts();
	}
};
function CalcTotalReward(actions) {
	let reward = 0;

	for (let index = 0; index < actions.length; index++) {
		const action = Number((actions[index]).toFixed(1));
		if (0.1 === action){
			// Buy
			reward -= Environment.GraphedData.DataObj.Price[index] * Environment.batteryCapacity;
		};
		if (-0.1 === action){
			// Sell
			reward += Environment.GraphedData.DataObj.Price[index] * Environment.batteryCapacity;
		};
	};
	return reward;
};
function EMA_CheckboxEvent() {
	let ckbx = document.getElementById('EMA_Checkbox');
	mainGraph.updateGraph('EMA',Strategies.EMA, Strategies.EMA.color,  ckbx.checked);
};
function DDQN_CheckboxEvent() {
	let ckbx = document.getElementById('DDQN_Checkbox');
	mainGraph.updateGraph('DDQN',DDQN.GraphedData,   Strategies.DDQN.color,  ckbx.checked);
};
function DQN_CheckboxEvent() {
	let ckbx = document.getElementById('DQN_Checkbox');
	mainGraph.updateGraph('DQN', DQN.GraphedData,  Strategies.DQN.color,  ckbx.checked);
};
function LP_CheckboxboxEvent() {
	let ckbx = document.getElementById('LP_Checkbox');
	mainGraph.updateGraph('Linear Programming',Strategies.Linprog, Strategies.Linprog.color,  ckbx.checked);
};
function DateChanged(){
	const newDateID = document.getElementsByClassName('slider')[0].value;
	const newDate = Environment.JsonData[newDateID].Date;
	Environment.setGraphedData(newDateID, Steps);
	document.getElementsByClassName("currentDate")[0].innerHTML = newDate;
	UpdateCalcs()
};
loadData(data_path).then(async JSON_DATA => {
	Environment = new Enve(JSON_DATA, soc);
	DDQN				= new Actor('Assets/Models/DDQN_Short_S1.onnx', 'DDQN', Environment.initSOC, '#A1A1CF');
	DQN					= new Actor('Assets/Models/DQN_Short_S1.onnx', 'DQN', Environment.initSOC, '#EF7FE3');
	document.getElementsByClassName("currentDate")[0].innerHTML = Environment.JsonData[StartIndex].Date;
	await UpdateCalcs();
});