'use strict';

const config = require('./config'),
    _ = require('underscore'),
    Markets = require('./Services/Markets/Markets'),
    BuyService = require('./Services/BuyService'),
    AccountsModel = require('./App/Models/accountModel'),
    BalanceModel = require('./App/Models/balanceModel'),
    ResourceModel = require('./App/Models/resourceModel'),
    MarketModel = require('./App/Models/marketModel'),
    StrategyModel = require('./App/Models/strategyModel'),
    PriceModel = require('./App/Models/priceModel'),
    Logger = require('./App/Utils/Logger');

const buyService = new BuyService();

async function init() {

    //Getting active accounts with balances and their resources and buy/sell strategies
    let accounts = await AccountsModel.scope(['active']).findAll({
        include: [
            {
                model: BalanceModel,
                as: 'balances',
                where: {status: 1},
                include: [
                    {
                        model: ResourceModel,
                        where: {status: 1},
                        include: [
                            {
                                model: StrategyModel,
                                as: 'buyStrategy'
                            },
                            {
                                model: StrategyModel,
                                as: 'sellStrategy'
                            }
                        ],
                        as: 'resources'
                    },
                    {
                        model: MarketModel,
                        as: 'market'
                    }]
            }
        ]
    });


    //Getting price history, order by timestamp
    let prices = await PriceModel.scope('ether').findAll({
        limit: 500,
        order: [
            ['created_at', 'DESC']
        ]
    });

    //Get Plain Objects into prices
    prices = prices.map((price) => price.get({plain: true})).reverse();


    return [accounts, prices];
}

function selectMarket(balance) {

    //Find markey by balance's market_id property
    return _.findWhere(Markets, {id: balance.market_id.toString()});
}

async function router(accounts, prices) {

    // We will check all active accounts
    for (let account of accounts) {


        //Balances associated with account
        for (let balance of account.balances) {

            // select correct market for balance
            let market = selectMarket(balance);

            market.transaction_fee = balance.market.transaction_fee;

            // init market from balance market informations
            market.class.init(balance.hashed_username, balance.hashed_special_key, balance.hashed_secret_key);

            // get last prices
            //TODO: cache last prices for 10 second
            let lastPrices = await market.class.lastPrices(balance.symbol);

            //Resources associated with balances
            for (let resource of balance.resources) {

                switch (resource.final_state) {
                    case 'buy':
                        await buy(account, market, balance.symbol, resource, prices, lastPrices.ask);
                        break;

                    case 'sell':

                        break;

                    case 'close':
                        //do nothing
                        break;
                    default:
                }

                //process.exit(0);
            }

        }

    }

}

async function buy(account, market, symbol, resource, prices, last_price) {

    //Get advice for buy action
    let advice = buyService.update(resource, prices, last_price);


    if (advice)
        Logger.buy(resource.title + ' kaynağı ile ' + last_price + '$ dan ' + resource.amount + ' ETH aldım.', account);

    //buy if advice is true
    if (advice) {

        //Calculating buy price
        let buyPrice = parseFloat(resource.amount * last_price);

        // Adding transaction fee
        buyPrice += Math.round(buyPrice * market.transaction_fee / 10) / 100;


        Logger.buy('Purchase has been completed. \n Ether Amount:' + resource.amount + "\n" + " Spent " + buyPrice.toFixed(2) + "$ \n" + " Over " + last_price + "$");

        //Send buy request to market
        //to prevent spontaneously buy action
        //let result = await market.class.buy_sell('buy', buyPrice.toFixed(2), symbol);

        //If buy request returns error
        if (result.error !== undefined) {
            Logger.error("Something went wrong during the purchase.", account, result);
        } else {

            //TODO: Market log
            //TODO: Update resource
            /**
             *  amount: result.symbol1Amount / 1000000
             *  order_id: result.id
             *  timestamp: result.time / 1000
             */


            //Logger.buy('Purchase has been completed. \n Ether Amount:' + resource.amount + "\n" + " Spent "+ buyPrice.toFixed(2) + "$ \n" + " Over " + last_price + "$");

        }

    }

}

function sell() {

}

function stop() {

}

async function run() {
    //run start date for calculating execution time
    let run_start = +new Date();

    //Firstly we will get accounts balances, resources and prices data
    let [accounts, prices] = await init();

    //Then we'll pass all data to Router method. Router method redirects resources to relevant function.
    //If routing completed run again
    router(accounts, prices).then(() => {

        //run stop date
        let run_completed = +new Date();

        //We will execute run again after 10 second including this one's execution time
        let execution_time = run_completed - run_start;

        Logger.info('This run took ' + execution_time + ' milisecond, next one will start after ' + (10000 - execution_time ) + ' milisecond');
        setTimeout(() => {
            run();
        }, Math.abs(10000 - execution_time));
    });


}


run();


